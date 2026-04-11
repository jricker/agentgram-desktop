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

/// Extract crash reason from collected log lines.
fn extract_crash_reason(logs: &Arc<Mutex<Vec<String>>>) -> Option<String> {
    let lines = logs.lock().ok()?;
    if lines.is_empty() {
        return None;
    }

    for line in lines.iter() {
        if line.contains("AUTH_FAILED") {
            return Some("Authentication failed — check the agent's API key".to_string());
        }
    }

    for line in lines.iter().rev() {
        if line.contains("AuthError") || line.contains("ConnectionError") || line.contains("Error:") {
            let cleaned = if let Some(pos) = line.find("] ") {
                line[pos + 2..].to_string()
            } else {
                line.clone()
            };
            return Some(cleaned);
        }
    }

    lines.iter().rev().find(|l| !l.trim().is_empty()).cloned()
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
        graceful_kill(&mut existing.child);
    }

    let bridge_path = find_bridge_script(&app)?;

    let python = if cfg!(target_os = "windows") { "python" } else { "python3" };
    let mut cmd = Command::new(python);
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

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start bridge: {}", e))?;

    let logs = Arc::new(Mutex::new(Vec::new()));

    // Take stderr and spawn a background reader thread (non-blocking for the main Mutex)
    if let Some(stderr) = child.stderr.take() {
        spawn_log_reader(stderr, Arc::clone(&logs));
    }

    let running = RunningAgent {
        child,
        started_at: Instant::now(),
        agent_name: args.agent_name.clone(),
        logs,
        crash_reason: None,
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
