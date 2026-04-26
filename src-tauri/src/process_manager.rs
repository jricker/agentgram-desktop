use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::State;

const MAX_LOG_LINES: usize = 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProcess {
    pub agent_id: String,
    pub agent_name: String,
    pub status: AgentStatus,
    pub uptime_secs: Option<u64>,
    pub exit_code: Option<i32>,
    pub crash_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Running,
    Stopped,
    Crashed,
    Starting,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAgentArgs {
    pub agent_id: String,
    pub agent_name: String,
    pub api_key: String,
    pub backend: Option<String>,
    pub model: Option<String>,
    pub llm_api_key: Option<String>,
    pub base_url: Option<String>,
    pub max_tokens: Option<u32>,
    pub history_limit: Option<u32>,
    pub execution_mode: Option<String>,
    pub dangerously_skip_permissions: Option<bool>,
    pub effort: Option<String>,
    pub api_url: Option<String>,
    pub add_dirs: Option<Vec<String>>,
}

struct RunningAgent {
    child: Child,
    started_at: Instant,
    agent_name: String,
    /// Shared log buffer — written by background reader thread, read by get_agent_logs
    logs: Arc<Mutex<Vec<String>>>,
    crash_reason: Option<String>,
    /// Used to fire a synchronous offline ping to the backend at shutdown.
    /// SIGTERM gives the bridge ~2s to deregister itself, but Force Quit /
    /// SIGKILL / crash would otherwise leave the agent "online" for 90s.
    agent_id: String,
    api_key: String,
    api_url: String,
}

pub struct ProcessManager {
    agents: HashMap<String, RunningAgent>,
}

impl ProcessManager {
    pub fn new() -> Self {
        kill_orphan_bridges();
        Self {
            agents: HashMap::new(),
        }
    }

    pub fn kill_all(&mut self) {
        let ids: Vec<String> = self.agents.keys().cloned().collect();
        for id in ids {
            if let Some(mut agent) = self.agents.remove(&id) {
                mark_offline_sync(&agent.api_url, &agent.agent_id, &agent.api_key);
                graceful_kill(&mut agent.child);
            }
        }
    }

    fn check_process_status(&mut self, agent_id: &str) -> (AgentStatus, Option<i32>) {
        if let Some(agent) = self.agents.get_mut(agent_id) {
            match agent.child.try_wait() {
                Ok(Some(status)) => {
                    let code = status.code();
                    if !status.success() && agent.crash_reason.is_none() {
                        // Try to extract crash reason from collected logs
                        agent.crash_reason = extract_crash_reason(&agent.logs);
                    }
                    if status.success() {
                        (AgentStatus::Stopped, code)
                    } else {
                        (AgentStatus::Crashed, code)
                    }
                }
                Ok(None) => (AgentStatus::Running, None),
                Err(_) => (AgentStatus::Crashed, None),
            }
        } else {
            (AgentStatus::Stopped, None)
        }
    }
}

/// Extract crash reason from collected log lines, providing user-friendly
/// messages with actionable fix instructions for common failure modes.
fn extract_crash_reason(logs: &Arc<Mutex<Vec<String>>>) -> Option<String> {
    let lines = logs.lock().ok()?;
    if lines.is_empty() {
        return None;
    }

    let all_text = lines.join("\n");

    // --- Missing Python packages ---
    if let Some(module) = extract_missing_module(&all_text) {
        let install_hint = match module.as_str() {
            "httpx" | "websockets" =>
                format!("Missing Python package '{module}'. Run: pip3 install -r desktop/bridge/requirements.txt"),
            "anthropic" =>
                format!("Missing Python package '{module}'. Run: pip3 install anthropic"),
            "openai" =>
                format!("Missing Python package '{module}'. Run: pip3 install openai"),
            _ =>
                format!("Missing Python package '{module}'. Run: pip3 install {module}"),
        };
        return Some(install_hint);
    }

    // --- Authentication failures ---
    if all_text.contains("AUTH_FAILED") || all_text.contains("401") {
        return Some("Authentication failed — the agent's API key may be invalid or expired. Try regenerating it in agent settings.".to_string());
    }
    if all_text.contains("AuthError") {
        return Some("Authentication error — check that the agent's API key is correct.".to_string());
    }

    // --- LLM API key issues ---
    if all_text.contains("AuthenticationError") && all_text.contains("api_key") {
        return Some("LLM API key is invalid or expired. Update it in agent settings under LLM Provider.".to_string());
    }
    if all_text.contains("Invalid API Key") || all_text.contains("Incorrect API key") {
        return Some("LLM API key is invalid. Check your API key in agent settings.".to_string());
    }
    if all_text.contains("RateLimitError") || all_text.contains("rate_limit") {
        return Some("LLM rate limit exceeded. Wait a moment and try again, or check your API plan limits.".to_string());
    }
    if all_text.contains("InsufficientQuotaError") || all_text.contains("insufficient_quota") {
        return Some("LLM API quota exceeded. Check your billing/usage at your LLM provider's dashboard.".to_string());
    }

    // --- Network / connection issues ---
    if all_text.contains("ConnectionError") || all_text.contains("ConnectError") {
        if all_text.contains("agentchat-backend") || all_text.contains("fly.dev") {
            return Some("Cannot connect to AgentGram server. Check your internet connection.".to_string());
        }
        return Some("Connection error — check your internet connection and try again.".to_string());
    }
    if all_text.contains("TimeoutError") || all_text.contains("timed out") {
        return Some("Request timed out. The server may be busy — try again in a moment.".to_string());
    }

    // --- Python runtime errors ---
    if all_text.contains("SyntaxError") {
        return Some("Python syntax error in bridge script. This is a bug — please report it.".to_string());
    }
    if all_text.contains("PermissionError") {
        return Some("Permission denied — the bridge script doesn't have access to a required file or directory.".to_string());
    }

    // --- Generic: find the last meaningful error line ---
    for line in lines.iter().rev() {
        // Look for Python traceback final lines
        if line.starts_with("ModuleNotFoundError:")
            || line.starts_with("ImportError:")
            || line.starts_with("RuntimeError:")
            || line.starts_with("ValueError:")
            || line.starts_with("TypeError:")
            || line.starts_with("OSError:")
            || line.starts_with("FileNotFoundError:")
            || line.contains("Error:") {
            let cleaned = if let Some(pos) = line.find("] ") {
                line[pos + 2..].to_string()
            } else {
                line.clone()
            };
            return Some(cleaned);
        }
    }

    // Last resort: return the last non-empty line
    lines.iter().rev().find(|l| !l.trim().is_empty()).cloned()
}

/// Parse "ModuleNotFoundError: No module named 'xxx'" from log text.
fn extract_missing_module(text: &str) -> Option<String> {
    for line in text.lines() {
        if line.contains("ModuleNotFoundError") && line.contains("No module named") {
            // Extract the module name from quotes
            if let Some(start) = line.find('\'') {
                if let Some(end) = line[start + 1..].find('\'') {
                    let module = &line[start + 1..start + 1 + end];
                    // Return the top-level package name
                    return Some(module.split('.').next().unwrap_or(module).to_string());
                }
            }
        }
    }
    None
}

/// Spawn a background thread that reads stderr lines and appends to the shared log buffer.
fn spawn_log_reader(stderr: std::process::ChildStderr, logs: Arc<Mutex<Vec<String>>>) {
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    if let Ok(mut buf) = logs.lock() {
                        buf.push(l);
                        // Trim if over max
                        if buf.len() > MAX_LOG_LINES {
                            let drain_count = buf.len() - MAX_LOG_LINES;
                            buf.drain(0..drain_count);
                        }
                    }
                }
                Err(_) => break,
            }
        }
    });
}

#[tauri::command]
pub fn start_agent(
    app: tauri::AppHandle,
    state: State<'_, Mutex<ProcessManager>>,
    args: StartAgentArgs,
) -> Result<AgentProcess, String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;

    // Stop existing process if running
    if let Some(mut existing) = manager.agents.remove(&args.agent_id) {
        mark_offline_sync(&existing.api_url, &existing.agent_id, &existing.api_key);
        graceful_kill(&mut existing.child);
    }

    let bridge_path = find_bridge_script(&app)?;

    let bridge_dir = std::path::Path::new(&bridge_path)
        .parent()
        .ok_or("Cannot determine bridge directory")?;
    let python = ensure_venv(bridge_dir)?;
    let mut cmd = Command::new(&python);
    cmd.arg(&bridge_path);

    // The agentchat SDK is co-located with the bridge script in bridge/.
    // Python adds the script's directory to sys.path[0] automatically,
    // but set PYTHONPATH as a belt-and-suspenders fallback.
    if let Some(bridge_dir) = std::path::Path::new(&bridge_path).parent() {
        let bridge_dir_str = bridge_dir.to_string_lossy().to_string();
        let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
        let pythonpath = match std::env::var("PYTHONPATH") {
            Ok(existing) => format!("{}{}{}", bridge_dir_str, sep, existing),
            Err(_) => bridge_dir_str,
        };
        cmd.env("PYTHONPATH", pythonpath);
    }

    cmd.env("AGENT_ID", &args.agent_id);
    cmd.env("AGENT_API_KEY", &args.api_key);

    if let Some(ref url) = args.api_url {
        cmd.env("AGENTGRAM_API_URL", url);
    }
    if let Some(ref backend) = args.backend {
        cmd.env("MODEL_BACKEND", backend);
    }

    if let Some(ref backend) = args.backend {
        cmd.args(["--backend", backend]);
    }
    if let Some(ref model) = args.model {
        cmd.args(["--model", model]);
    }
    if let Some(ref key) = args.llm_api_key {
        cmd.args(["--api-key", key]);
    }
    if let Some(ref url) = args.base_url {
        cmd.args(["--base-url", url]);
    }
    if let Some(tokens) = args.max_tokens {
        cmd.args(["--max-tokens", &tokens.to_string()]);
    }
    if let Some(limit) = args.history_limit {
        cmd.args(["--history-limit", &limit.to_string()]);
    }
    if let Some(ref mode) = args.execution_mode {
        cmd.args(["--execution-mode", mode]);
    }
    if args.dangerously_skip_permissions.unwrap_or(false) {
        cmd.arg("--dangerously-skip-permissions");
    }
    if let Some(ref effort) = args.effort {
        cmd.args(["--effort", effort]);
    }
    if let Some(ref dirs) = args.add_dirs {
        let valid: Vec<&String> = dirs.iter().filter(|d| !d.is_empty()).collect();
        if !valid.is_empty() {
            cmd.env("CLAUDE_CLI_ADD_DIRS", valid.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(","));
        }
    }

    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        format!("Failed to start bridge: {}", e)
    })?;

    let logs = Arc::new(Mutex::new(Vec::new()));

    // Take stderr and spawn a background reader thread (non-blocking for the main Mutex)
    if let Some(stderr) = child.stderr.take() {
        spawn_log_reader(stderr, Arc::clone(&logs));
    }

    let api_url = args
        .api_url
        .clone()
        .unwrap_or_else(|| "https://agentchat-backend.fly.dev".to_string());

    let running = RunningAgent {
        child,
        started_at: Instant::now(),
        agent_name: args.agent_name.clone(),
        logs,
        crash_reason: None,
        agent_id: args.agent_id.clone(),
        api_key: args.api_key.clone(),
        api_url,
    };

    let agent_id = args.agent_id.clone();
    manager.agents.insert(agent_id.clone(), running);

    Ok(AgentProcess {
        agent_id,
        agent_name: args.agent_name,
        status: AgentStatus::Running,
        uptime_secs: Some(0),
        exit_code: None,
        crash_reason: None,
    })
}

#[tauri::command]
pub fn stop_agent(
    state: State<'_, Mutex<ProcessManager>>,
    agent_id: String,
) -> Result<AgentProcess, String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;

    if let Some(mut agent) = manager.agents.remove(&agent_id) {
        mark_offline_sync(&agent.api_url, &agent.agent_id, &agent.api_key);
        graceful_kill(&mut agent.child);

        let name = agent.agent_name.clone();

        Ok(AgentProcess {
            agent_id,
            agent_name: name,
            status: AgentStatus::Stopped,
            uptime_secs: None,
            exit_code: Some(0),
            crash_reason: None,
        })
    } else {
        Err(format!("Agent {} is not running", agent_id))
    }
}

#[tauri::command]
pub fn get_agent_status(
    state: State<'_, Mutex<ProcessManager>>,
    agent_id: String,
) -> Result<AgentProcess, String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    let (status, exit_code) = manager.check_process_status(&agent_id);

    if let Some(agent) = manager.agents.get(&agent_id) {
        let uptime = if status == AgentStatus::Running {
            Some(agent.started_at.elapsed().as_secs())
        } else {
            None
        };

        Ok(AgentProcess {
            agent_id,
            agent_name: agent.agent_name.clone(),
            status,
            uptime_secs: uptime,
            exit_code,
            crash_reason: agent.crash_reason.clone(),
        })
    } else {
        Ok(AgentProcess {
            agent_id,
            agent_name: String::new(),
            status: AgentStatus::Stopped,
            uptime_secs: None,
            exit_code: None,
            crash_reason: None,
        })
    }
}

#[tauri::command]
pub fn get_all_statuses(
    state: State<'_, Mutex<ProcessManager>>,
) -> Result<Vec<AgentProcess>, String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;

    let agent_ids: Vec<String> = manager.agents.keys().cloned().collect();
    let mut results = Vec::new();

    for id in agent_ids {
        let (status, exit_code) = manager.check_process_status(&id);
        if let Some(agent) = manager.agents.get(&id) {
            let uptime = if status == AgentStatus::Running {
                Some(agent.started_at.elapsed().as_secs())
            } else {
                None
            };
            results.push(AgentProcess {
                agent_id: id,
                agent_name: agent.agent_name.clone(),
                status,
                uptime_secs: uptime,
                exit_code,
                crash_reason: agent.crash_reason.clone(),
            });
        }
    }

    Ok(results)
}

#[tauri::command]
pub fn get_agent_logs(
    state: State<'_, Mutex<ProcessManager>>,
    agent_id: String,
    tail: Option<usize>,
) -> Result<Vec<String>, String> {
    let manager = state.lock().map_err(|e| e.to_string())?;

    if let Some(agent) = manager.agents.get(&agent_id) {
        // Read from the shared log buffer (populated by background thread)
        let logs = agent.logs.lock().map_err(|e| e.to_string())?;

        let count = tail.unwrap_or(100).min(logs.len());
        let start = logs.len().saturating_sub(count);
        Ok(logs[start..].to_vec())
    } else {
        Ok(Vec::new())
    }
}

/// Tell the backend the agent is offline before killing the bridge.
///
/// Belt-and-suspenders for the SDK's own SIGTERM-triggered deregister:
/// covers Force Quit, SIGKILL, crashes, or any path where Python doesn't
/// get to run its signal handler. Best-effort — short timeout, errors are
/// swallowed because we're seconds from killing the process anyway.
fn mark_offline_sync(api_url: &str, agent_id: &str, api_key: &str) {
    let url = format!("{}/api/gateway/shutdown", api_url.trim_end_matches('/'));
    let _ = ureq::post(&url)
        .timeout(std::time::Duration::from_millis(1500))
        .send_json(ureq::json!({
            "agent_id": agent_id,
            "api_key": api_key,
        }));
}

fn graceful_kill(child: &mut Child) {
    let pid = child.id();

    #[cfg(unix)]
    {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        for _ in 0..20 {
            match child.try_wait() {
                Ok(Some(_)) => return,
                _ => std::thread::sleep(std::time::Duration::from_millis(100)),
            }
        }
        let _ = child.kill();
    }

    #[cfg(not(unix))]
    {
        let _ = child.kill();
    }

    let _ = child.wait();
}

fn kill_orphan_bridges() {
    #[cfg(unix)]
    {
        if let Ok(output) = Command::new("pgrep")
            .args(["-f", "agent_bridge\\.py"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let my_pid = std::process::id();
            for line in stdout.lines() {
                if let Ok(pid) = line.trim().parse::<u32>() {
                    if pid != my_pid {
                        unsafe {
                            libc::kill(pid as i32, libc::SIGTERM);
                        }
                        eprintln!("[ProcessManager] Killed orphan bridge process {}", pid);
                    }
                }
            }
        }
    }
}

/// Ensure a Python virtual environment exists with required packages installed.
/// Creates the venv and runs `pip install -r requirements.txt` on first launch,
/// and re-installs when requirements.txt changes.
/// Returns the path to the venv's python executable.
fn ensure_venv(bridge_dir: &std::path::Path) -> Result<String, String> {
    let venv_dir = bridge_dir.join("venv");

    let (venv_python, system_python) = if cfg!(target_os = "windows") {
        (venv_dir.join("Scripts").join("python.exe"), "python")
    } else {
        (venv_dir.join("bin").join("python3"), "python3")
    };

    // Create venv if it doesn't exist
    if !venv_python.exists() {
        eprintln!("[ProcessManager] Creating Python venv at {:?}", venv_dir);
        let output = Command::new(system_python)
            .args(["-m", "venv", &venv_dir.to_string_lossy()])
            .output()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    format!(
                        "Python not found. Install Python 3.11+ from https://python.org and ensure '{}' is on your PATH.",
                        system_python
                    )
                } else {
                    format!("Failed to create Python venv: {}", e)
                }
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to create Python venv: {}", stderr));
        }
    }

    // Install/update requirements if needed
    let req_file = bridge_dir.join("requirements.txt");
    let marker = venv_dir.join(".deps_installed");

    if req_file.exists() && needs_dep_install(&req_file, &marker) {
        eprintln!("[ProcessManager] Installing Python dependencies from requirements.txt");
        let output = Command::new(&venv_python)
            .args(["-m", "pip", "install", "--quiet", "-r", &req_file.to_string_lossy()])
            .output()
            .map_err(|e| format!("Failed to install Python dependencies: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to install Python dependencies: {}", stderr));
        }

        // Touch marker so we skip next time unless requirements.txt changes
        if let Err(e) = std::fs::write(&marker, "") {
            eprintln!("[ProcessManager] Warning: failed to write deps marker: {}", e);
        }
    }

    Ok(venv_python.to_string_lossy().to_string())
}

/// Returns true if pip install should run: either the marker doesn't exist
/// or requirements.txt has been modified since the last install.
fn needs_dep_install(req_file: &std::path::Path, marker: &std::path::Path) -> bool {
    if !marker.exists() {
        return true;
    }
    match (req_file.metadata(), marker.metadata()) {
        (Ok(req_meta), Ok(marker_meta)) => match (req_meta.modified(), marker_meta.modified()) {
            (Ok(req_time), Ok(marker_time)) => req_time > marker_time,
            _ => true,
        },
        _ => true,
    }
}

fn find_bridge_script(app: &tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;

    // 1. Tauri resource directory (bundled app)
    //    Resources from ../bridge/ resolve to _up_/bridge/ in the bundle
    if let Ok(resource_dir) = app.path().resource_dir() {
        let path = resource_dir
            .join("_up_")
            .join("bridge")
            .join("agent_bridge.py");
        if path.exists() {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    // 2. Walk up from the executable, looking for desktop/bridge/
    if let Ok(exe) = std::env::current_exe().and_then(|e| e.canonicalize()) {
        for ancestor in exe.ancestors().skip(1) {
            let candidate = ancestor.join("bridge").join("agent_bridge.py");
            if candidate.exists() {
                return Ok(candidate.to_string_lossy().to_string());
            }
        }
    }

    // 3. Walk up from cwd (dev mode fallback)
    if let Ok(cwd) = std::env::current_dir() {
        for ancestor in cwd.ancestors() {
            let candidate = ancestor.join("bridge").join("agent_bridge.py");
            if candidate.exists() {
                return Ok(candidate.to_string_lossy().to_string());
            }
        }
    }

    Err("Bridge script not found. Ensure desktop/bridge/agent_bridge.py exists.".to_string())
}
