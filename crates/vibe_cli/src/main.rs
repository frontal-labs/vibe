//! The `vibe` command-line interface.
//!
//! `vibe check` reports diagnostics (non-zero exit on error — the CI command),
//! `vibe build` emits TypeScript to `.vibe/`, `vibe new` scaffolds a project,
//! `vibe info` prints a summary. `vibe dev` (watch + run) lands in Phase R7 and
//! `vibe fmt` in R10. See `docs/language/03-toolchain.md`.
#![forbid(unsafe_code)]

use clap::{Parser, Subcommand};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command as Proc;

use vibe_compiler::{tscheck, Diagnostic, Emit, Severity};

/// Ambient stubs so `tsc` resolves the runtime modules and checks the *bodies*
/// without needing the `@vibe/*` packages installed.
const RUNTIME_STUBS: &str = "\
declare module \"zod\" { export const z: any; }
declare module \"@vibe/tools\" { export function defineTool(config: any): any; }
declare module \"@vibe/agent\" { export function createAgent(config: any): any; }
declare module \"@vibe/config\" { export function defineConfig(config: any): any; }
declare module \"@vibe/memory\" { export function createMemory(config: any): any; }
";

// `noImplicitAny` is off so the synthetic `_input`/`_ctx` params (untyped against
// the stub runtime) don't produce noise — real body type errors still surface.
const TSCONFIG: &str = "\
{ \"compilerOptions\": { \"noEmit\": true, \"strict\": true, \"noImplicitAny\": false, \
\"skipLibCheck\": true, \"target\": \"ESNext\", \"module\": \"ESNext\", \
\"moduleResolution\": \"Bundler\", \"types\": [], \"pretty\": false }, \"include\": [\"*.ts\"] }
";

#[derive(Parser)]
#[command(name = "vibe", version, about = "The Vibe language toolchain")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Compile `.vibe` files to TypeScript in `.vibe/`.
    Build {
        #[arg(default_value = ".")]
        path: PathBuf,
    },
    /// Compile and watch for changes, recompiling incrementally.
    Dev {
        #[arg(default_value = ".")]
        path: PathBuf,
        /// Compile once and exit instead of watching.
        #[arg(long)]
        no_watch: bool,
    },
    /// Type-check `.vibe` files; exits non-zero if there are errors.
    Check {
        #[arg(default_value = ".")]
        path: PathBuf,
        /// Also run `tsc` on the emitted TypeScript and report re-anchored errors.
        #[arg(long)]
        ts: bool,
    },
    /// Format `.vibe` files in place (or check with `--check`).
    Fmt {
        #[arg(default_value = ".")]
        path: PathBuf,
        /// Report unformatted files and exit non-zero instead of writing.
        #[arg(long)]
        check: bool,
    },
    /// Scaffold a new Vibe project.
    New {
        name: String,
        /// Template: `minimal`, `tool` (default), or `multi`.
        #[arg(long, default_value = "tool")]
        template: String,
    },
    /// Print information about a project.
    Info {
        #[arg(default_value = ".")]
        path: PathBuf,
    },
}

fn main() {
    let cli = Cli::parse();
    let code = match cli.command {
        Command::Build { path } => cmd_build(&path),
        Command::Dev { path, no_watch } => cmd_dev(&path, no_watch),
        Command::Check { path, ts } => cmd_check(&path, ts),
        Command::Fmt { path, check } => cmd_fmt(&path, check),
        Command::New { name, template } => cmd_new(&name, &template),
        Command::Info { path } => cmd_info(&path),
    };
    std::process::exit(code);
}

/// Collect the `.vibe` files under `path` (or `path` itself if it's a file).
fn vibe_files(path: &Path) -> std::io::Result<Vec<PathBuf>> {
    if path.is_file() {
        return Ok(vec![path.to_path_buf()]);
    }
    let mut files = Vec::new();
    for entry in fs::read_dir(path)? {
        let p = entry?.path();
        if p.extension().and_then(|e| e.to_str()) == Some("vibe") {
            files.push(p);
        }
    }
    files.sort();
    Ok(files)
}

fn cmd_check(path: &Path, ts: bool) -> i32 {
    let files = match vibe_files(path) {
        Ok(f) => f,
        Err(e) => return io_error(path, e),
    };
    if files.is_empty() {
        eprintln!("vibe: no `.vibe` files found in {}", path.display());
        return 0;
    }
    let tsc = if ts { find_tsc(path) } else { None };
    if ts && tsc.is_none() {
        eprintln!(
            "vibe: --ts requested but `tsc` not found (set VIBE_TSC or install typescript); skipping"
        );
    }

    let mut errors = 0usize;
    let mut warnings = 0usize;
    for file in &files {
        let src = match fs::read_to_string(file) {
            Ok(s) => s,
            Err(e) => return io_error(file, e),
        };
        let name = file.display().to_string();
        let comp = vibe_compiler::compile(&src);
        let mut diags = comp.diagnostics.clone();
        if let Some(tsc) = &tsc {
            match ts_diagnostics(tsc, &comp.outputs[0]) {
                Ok(td) => diags.extend(td),
                Err(e) => eprintln!("vibe: TypeScript check failed for {name}: {e}"),
            }
        }
        diags.sort_by_key(|d| (d.span.lo, d.code.0));
        if !diags.is_empty() {
            eprint!("{}", vibe_compiler::render_diagnostics(&name, &src, &diags));
        }
        errors += diags
            .iter()
            .filter(|d| d.severity == Severity::Error)
            .count();
        warnings += diags
            .iter()
            .filter(|d| d.severity == Severity::Warning)
            .count();
    }
    if errors > 0 {
        eprintln!("vibe: {errors} error(s), {warnings} warning(s)");
        1
    } else {
        println!("vibe: no errors ({warnings} warning(s))");
        0
    }
}

/// Run `tsc` over the emitted TypeScript and re-anchor its diagnostics to `.vibe`.
fn ts_diagnostics(tsc: &Path, emit: &Emit) -> std::io::Result<Vec<Diagnostic>> {
    let tmp = tempfile::tempdir()?;
    let dir = tmp.path();
    fs::write(dir.join("module.ts"), &emit.typescript)?;
    fs::write(dir.join("vibe-runtime.d.ts"), RUNTIME_STUBS)?;
    fs::write(dir.join("tsconfig.json"), TSCONFIG)?;
    let output = Proc::new(tsc)
        .arg("--project")
        .arg(dir.join("tsconfig.json"))
        .current_dir(dir)
        .output()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let errors = tscheck::parse_tsc_output(&stdout);
    Ok(tscheck::reanchor(&errors, &emit.line_map))
}

/// Locate `tsc`: `$VIBE_TSC`, else `node_modules/.bin/tsc` walking up from `path`.
fn find_tsc(path: &Path) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("VIBE_TSC") {
        if !p.is_empty() {
            return Some(PathBuf::from(p));
        }
    }
    let start = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let mut dir = if start.is_file() {
        start.parent()?.to_path_buf()
    } else {
        start
    };
    loop {
        let cand = dir.join("node_modules").join(".bin").join("tsc");
        if cand.exists() {
            return Some(cand);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

/// The `.vibe/` output dir for a project path (dir → `<dir>/.vibe`, file → sibling).
fn out_dir_for(path: &Path) -> PathBuf {
    let root = if path.is_file() {
        path.parent().unwrap_or(Path::new(".")).to_path_buf()
    } else {
        path.to_path_buf()
    };
    root.join(".vibe")
}

/// Compile every `.vibe` file, print diagnostics, and write emitted TS to `out_dir`.
/// Returns `(file_count, error_count)`. Shared by `build` and `dev`.
fn compile_project(path: &Path, out_dir: &Path) -> std::io::Result<(usize, usize)> {
    let files = vibe_files(path)?;
    fs::create_dir_all(out_dir)?;
    let mut errors = 0usize;
    for file in &files {
        let src = fs::read_to_string(file)?;
        let name = file.display().to_string();
        let comp = vibe_compiler::compile(&src);
        if !comp.diagnostics.is_empty() {
            eprint!(
                "{}",
                vibe_compiler::render_diagnostics(&name, &src, &comp.diagnostics)
            );
        }
        errors += comp.error_count();

        // Emit even when there are errors, so partial output is available.
        let stem = file
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("module");
        let emit = &comp.outputs[0];
        let ts = format!(
            "{}\n//# sourceMappingURL={stem}.vibe.ts.map\n",
            emit.typescript.trim_end()
        );
        fs::write(out_dir.join(format!("{stem}.vibe.ts")), ts)?;
        fs::write(
            out_dir.join(format!("{stem}.vibe.d.ts")),
            &emit.declarations,
        )?;
        fs::write(
            out_dir.join(format!("{stem}.vibe.ts.map")),
            &emit.source_map,
        )?;
    }
    Ok((files.len(), errors))
}

fn cmd_build(path: &Path) -> i32 {
    let out_dir = out_dir_for(path);
    match compile_project(path, &out_dir) {
        Ok((0, _)) => {
            eprintln!("vibe: no `.vibe` files found in {}", path.display());
            0
        }
        Ok((n, 0)) => {
            println!("vibe: built {n} file(s) → {}", out_dir.display());
            0
        }
        Ok((_, errors)) => {
            eprintln!("vibe: build completed with {errors} error(s)");
            1
        }
        Err(e) => io_error(path, e),
    }
    // Note: transpiling to `dist/*.js` and running needs the `@vibe/*` runtime.
}

fn cmd_dev(path: &Path, no_watch: bool) -> i32 {
    let out_dir = out_dir_for(path);
    let start = std::time::Instant::now();
    let (files, errors) = match compile_project(path, &out_dir) {
        Ok(r) => r,
        Err(e) => return io_error(path, e),
    };
    if files == 0 {
        eprintln!("vibe: no `.vibe` files found in {}", path.display());
        return 0;
    }
    println!(
        "vibe dev: compiled {files} file(s) in {}ms — {errors} error(s)",
        start.elapsed().as_millis()
    );
    if no_watch {
        return i32::from(errors > 0);
    }
    println!(
        "vibe dev: watching {} (Ctrl-C to stop). Note: running the agent needs the \
@vibe/* runtime.",
        path.display()
    );
    watch_loop(path, &out_dir)
}

/// Watch `path` for `.vibe` changes and recompile (debounced). Runs until killed.
fn watch_loop(path: &Path, out_dir: &Path) -> i32 {
    use notify::{RecursiveMode, Watcher};
    use std::sync::mpsc::channel;
    use std::time::Duration;

    let (tx, rx) = channel();
    let mut watcher = match notify::recommended_watcher(move |res| {
        let _ = tx.send(res);
    }) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("vibe: watch error: {e}");
            return 2;
        }
    };
    let watch_root = if path.is_file() {
        path.parent().unwrap_or(Path::new(".")).to_path_buf()
    } else {
        path.to_path_buf()
    };
    if let Err(e) = watcher.watch(&watch_root, RecursiveMode::Recursive) {
        eprintln!("vibe: watch error: {e}");
        return 2;
    }

    loop {
        match rx.recv() {
            Ok(Ok(event)) => {
                let touches_vibe = event
                    .paths
                    .iter()
                    .any(|p| p.extension().and_then(|e| e.to_str()) == Some("vibe"));
                if !touches_vibe {
                    continue; // ignore our own `.vibe/` output writes (`.ts`/`.map`)
                }
                // Debounce: coalesce a burst of events.
                while rx.recv_timeout(Duration::from_millis(150)).is_ok() {}
                let start = std::time::Instant::now();
                match compile_project(path, out_dir) {
                    Ok((n, errors)) => println!(
                        "vibe dev: recompiled {n} file(s) in {}ms — {errors} error(s)",
                        start.elapsed().as_millis()
                    ),
                    Err(e) => eprintln!("vibe: {e}"),
                }
            }
            Ok(Err(e)) => eprintln!("vibe: watch error: {e}"),
            Err(_) => return 0, // channel closed
        }
    }
}

/// Format `.vibe` files in place (or check formatting with `--check`).
fn cmd_fmt(path: &Path, check: bool) -> i32 {
    let files = match vibe_files(path) {
        Ok(f) => f,
        Err(e) => return io_error(path, e),
    };
    if files.is_empty() {
        eprintln!("vibe: no `.vibe` files found in {}", path.display());
        return 0;
    }
    let mut unformatted = 0usize;
    for file in &files {
        let src = match fs::read_to_string(file) {
            Ok(s) => s,
            Err(e) => return io_error(file, e),
        };
        let formatted = vibe_fmt::format(&src);
        if formatted == src {
            continue;
        }
        if check {
            unformatted += 1;
            eprintln!("vibe: {} is not formatted", file.display());
        } else if let Err(e) = fs::write(file, formatted) {
            return io_error(file, e);
        } else {
            println!("vibe: formatted {}", file.display());
        }
    }
    if check && unformatted > 0 {
        eprintln!("vibe: {unformatted} file(s) need formatting");
        1
    } else {
        0
    }
}

fn cmd_new(name: &str, template: &str) -> i32 {
    let dir = PathBuf::from(name);
    if dir.exists() {
        eprintln!("vibe: `{name}` already exists");
        return 1;
    }
    if let Err(e) = fs::create_dir_all(&dir) {
        return io_error(&dir, e);
    }
    let app = dir.file_name().and_then(|s| s.to_str()).unwrap_or("app");
    let sample = match template {
        "minimal" => minimal_template(app),
        "multi" => multi_template(app),
        _ => tool_template(app), // "tool" (default)
    };
    if let Err(e) = fs::write(dir.join("main.vibe"), sample) {
        return io_error(&dir, e);
    }
    println!("vibe: created {name}/main.vibe ({template}) — run `vibe check {name}`");
    0
}

fn minimal_template(app: &str) -> String {
    format!(
        "config {{ name \"{app}\" ; provider anthropic }}\n\n\
agent Assistant {{\n  \
model claude-opus-4-8\n  \
system \"You are a helpful assistant.\"\n}}\n"
    )
}

fn tool_template(app: &str) -> String {
    format!(
        "config {{ name \"{app}\" ; provider anthropic }}\n\n\
/// Greet someone by name.\n\
tool Greet(name: string) -> string {{ return `Hello, ${{name}}!` }}\n\n\
agent Assistant {{\n  \
model claude-opus-4-8\n  \
system \"You are a friendly assistant. Use tools when helpful.\"\n  \
use Greet\n}}\n"
    )
}

fn multi_template(app: &str) -> String {
    format!(
        "config {{ name \"{app}\" ; provider anthropic }}\n\n\
/// Look up an order's status.\n\
tool GetOrder(orderId: string) -> string {{ return `shipped: ${{orderId}}` }}\n\n\
model Fast {{ id claude-haiku-4-5 ; effort low }}\n\n\
agent Triage {{\n  \
model Fast\n  \
system \"Classify the request and route it.\"\n  \
use GetOrder\n}}\n\n\
agent Support {{\n  \
model claude-opus-4-8\n  \
system \"You are a concise support agent. Delegate triage when useful.\"\n  \
use GetOrder\n  \
use Triage\n}}\n"
    )
}

fn cmd_info(path: &Path) -> i32 {
    match vibe_files(path) {
        Ok(files) => {
            println!("vibe {}", env!("CARGO_PKG_VERSION"));
            println!("{} `.vibe` file(s) in {}", files.len(), path.display());
            0
        }
        Err(e) => io_error(path, e),
    }
}

fn io_error(path: &Path, e: std::io::Error) -> i32 {
    eprintln!("vibe: {}: {e}", path.display());
    2
}
