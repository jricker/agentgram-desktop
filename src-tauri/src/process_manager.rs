use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
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
    pub api_url: Option<String>,
}

struct RunningAgent {
    child: Child,
    started_at: Instant,
    agent_name: String,
    logs: Vec<String>,
    log_reader_started: bool,
    crash_reason: Option<String>,
}

pub struct ProcessManager {
    agents: HashMap<String, RunningAgent>,
}

impl ProcessManager {
    pub fn new() -> Self {
        // Kill any orphaned bridge processes from a previous session
        kill_orphan_bridges();

        Self {
            agents: HashMap::new(),
        }
    }

    /// Kill all managed bridge processes. Called on app exit.
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
                        // Process crashed — drain stderr to capture the reason
                        agent.crash_reason = drain_crash_reason(agent);
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

/// Read remaining stderr from a crashed process and extract the crash reason.
/// Looks for AUTH_FAILED markers or falls back to the last meaningful line.
fn drain_crash_reason(agent: &mut RunningAgent) -> Option<String> {
    let stderr = agent.child.stderr.take()?;
    let reader = BufReader::new(stderr);
    let mut lines: Vec<String> = Vec::new();

    for line in reader.lines() {
        match line {
            Ok(l) => lines.push(l),
            Err(_) => break,
        }
    }

    // Store all lines as logs too
    agent.logs.extend(lines.clone());
    agent.log_reader_started = true;

    if lines.is_empty() {
        return None;
    }

    // Look for known error markers (most specific first)
    for line in &lines {
        if line.contains("AUTH_FAILED") {
            return Some("Authentication failed — check the agent's API key".to_string());
        }
    }

    // Look for Python exception lines
    for line in lines.iter().rev() {
        if line.contains("AuthError") || line.contains("ConnectionError") || line.contains("Error:") {
            // Clean up the line — remove timestamp prefix if present
            let cleaned = if let Some(pos) = line.find("] ") {
                line[pos + 2..].to_string()
            } else {
                line.clone()
            };
            return Some(cleaned);
        }
    }

    // Fall back to last non-empty line
    lines.iter().rev().find(|l| !l.trim().is_empty()).cloned()
}

#[tauri::command]
pub fn start_agent(
    state: State<'_, Mutex<ProcessManager>>,
    args: StartAgentArgs,
) -> Result<AgentProcess, String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;

    // Stop existing process if running
    if let Some(mut existing) = manager.agents.remove(&args.agent_id) {
        graceful_kill(&mut existing.child);
    }

    // Find the bridge script — look relative to the binary or use the repo path
    let bridge_path = find_bridge_script()?;

    let mut cmd = Command::new("python3");
    cmd.arg(&bridge_path);

    // Set environment variables
    cmd.env("AGENT_ID", &args.agent_id);
    cmd.env("AGENT_API_KEY", &args.api_key);

    if let Some(ref url) = args.api_url {
        cmd.env("AGENTGRAM_API_URL", url);
    }
    if let Some(ref backend) = args.backend {
        cmd.env("MODEL_BACKEND", backend);
    }

    // Build CLI args for the bridge
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

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let child = cmd.spawn().map_err(|e| format!("Failed to start bridge: {}", e))?;

    let running = RunningAgent {
        child,
        started_at: Instant::now(),
        agent_name: args.agent_name.clone(),
        logs: Vec::new(),
        log_reader_started: false,
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
    let mut manager = state.lock().map_err(|e| e.to_string())?;

    if let Some(agent) = manager.agents.get_mut(&agent_id) {
        // Read any new output from stderr (bridge logs to stderr)
        if !agent.log_reader_started {
            if let Some(stderr) = agent.child.stderr.take() {
                let reader = BufReader::new(stderr);
                let mut lines: Vec<String> = Vec::new();
                // Non-blocking: read what's available
                for line in reader.lines() {
                    match line {
                        Ok(l) => lines.push(l),
                        Err(_) => break,
                    }
                }
                agent.logs.extend(lines);
                agent.log_reader_started = true;
            }
        }

        // Trim if over max
        if agent.logs.len() > MAX_LOG_LINES {
            let drain_count = agent.logs.len() - MAX_LOG_LINES;
            agent.logs.drain(0..drain_count);
        }

        let count = tail.unwrap_or(100).min(agent.logs.len());
        let start = agent.logs.len().saturating_sub(count);
        Ok(agent.logs[start..].to_vec())
    } else {
        Ok(Vec::new())
    }
}

/// Gracefully kill a child process: SIGTERM first, wait briefly, then SIGKILL.
fn graceful_kill(child: &mut Child) {
    let pid = child.id();

    #[cfg(unix)]
    {
        // Send SIGTERM for graceful shutdown
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        // Wait up to 2 seconds for graceful exit
        for _ in 0..20 {
            match child.try_wait() {
                Ok(Some(_)) => return, // exited
                _ => std::thread::sleep(std::time::Duration::from_millis(100)),
            }
        }
        // Still alive — force kill
        let _ = child.kill();
    }

    #[cfg(not(unix))]
    {
        let _ = child.kill();
    }

    let _ = child.wait();
}

/// Kill orphaned agent_bridge.py processes from a previous app session.
/// Uses `pgrep` to find them and `kill` to terminate.
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

fn find_bridge_script() -> Result<String, String> {
    // In development: look in the repo
    let dev_path = std::env::current_dir()
        .ok()
        .map(|d| d.join("../scripts/agent_bridge.py"))
        .and_then(|p| p.canonicalize().ok());

    if let Some(path) = dev_path {
        if path.exists() {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    // Also check relative to the Agentgram project root
    let project_paths = [
        "/Users/jricker/Documents/GitHub/Agentgram/scripts/agent_bridge.py",
    ];

    for path in &project_paths {
        if std::path::Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    // In production: look in bundled resources
    // TODO: resolve from app bundle path

    Err("Bridge script not found. Ensure agent_bridge.py is accessible.".to_string())
}
