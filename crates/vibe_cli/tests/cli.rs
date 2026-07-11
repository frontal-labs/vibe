//! End-to-end CLI tests driving the built `vibe` binary via `assert_cmd`.

use assert_cmd::Command;
use predicates::prelude::*;
use std::fs;
use tempfile::tempdir;

fn vibe() -> Command {
    Command::cargo_bin("vibe").unwrap()
}

const VALID: &str = "\
config { name \"demo\" }
tool Greet(name: string) -> string { return `Hi ${name}` }
agent A { model claude-opus-4-8 use Greet }
";

#[test]
fn version_flag_works() {
    vibe().arg("--version").assert().success();
}

#[test]
fn check_valid_project_succeeds() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("main.vibe"), VALID).unwrap();
    vibe()
        .arg("check")
        .arg(dir.path())
        .assert()
        .success()
        .stdout(predicate::str::contains("no errors"));
}

#[test]
fn check_invalid_project_fails_with_diagnostic() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("bad.vibe"), "agent A { use Ghost }").unwrap();
    vibe()
        .arg("check")
        .arg(dir.path())
        .assert()
        .failure()
        .code(1)
        .stderr(predicate::str::contains("VB2100"));
}

#[test]
fn build_writes_typescript_and_sourcemap() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("main.vibe"), VALID).unwrap();
    vibe().arg("build").arg(dir.path()).assert().success();

    let ts = fs::read_to_string(dir.path().join(".vibe/main.vibe.ts")).unwrap();
    assert!(ts.contains("defineTool"));
    assert!(ts.contains("createAgent"));
    assert!(ts.contains("//# sourceMappingURL=main.vibe.ts.map"));

    assert!(dir.path().join(".vibe/main.vibe.d.ts").exists());
    let map = fs::read_to_string(dir.path().join(".vibe/main.vibe.ts.map")).unwrap();
    assert!(map.contains("\"version\":3"));
}

#[test]
fn fmt_check_then_write_then_clean() {
    let dir = tempdir().unwrap();
    let f = dir.path().join("m.vibe");
    fs::write(&f, "config{name \"x\"}agent A{model claude-opus-4-8}").unwrap();

    // `--check` on unformatted source fails.
    vibe()
        .arg("fmt")
        .arg(&f)
        .arg("--check")
        .assert()
        .failure()
        .code(1);
    // Formatting rewrites it.
    vibe().arg("fmt").arg(&f).assert().success();
    // Now it's clean.
    vibe().arg("fmt").arg(&f).arg("--check").assert().success();

    let out = fs::read_to_string(&f).unwrap();
    assert!(out.contains("config {\n  name \"x\"\n}"));
}

#[test]
fn new_multi_template_scaffolds_a_checkable_project() {
    let dir = tempdir().unwrap();
    vibe()
        .current_dir(dir.path())
        .arg("new")
        .arg("proj")
        .arg("--template")
        .arg("multi")
        .assert()
        .success();
    vibe()
        .arg("check")
        .arg(dir.path().join("proj"))
        .assert()
        .success();
}

#[test]
fn dev_no_watch_compiles_once_and_emits() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("main.vibe"), VALID).unwrap();
    vibe()
        .arg("dev")
        .arg(dir.path())
        .arg("--no-watch")
        .assert()
        .success()
        .stdout(predicate::str::contains("compiled"));
    assert!(dir.path().join(".vibe/main.vibe.ts").exists());
}

#[test]
fn ts_check_reanchors_typescript_errors_to_vibe() {
    // Locate the repo's tsc; skip cleanly if Node/tsc isn't installed (e.g. a CI
    // job without the JS toolchain) so this test never blocks the Rust track.
    let repo_tsc =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../node_modules/.bin/tsc");
    if !repo_tsc.exists() {
        eprintln!(
            "skipping ts-check test: tsc not found at {}",
            repo_tsc.display()
        );
        return;
    }
    let dir = tempdir().unwrap();
    // The type error is on line 2 of the .vibe file.
    fs::write(
        dir.path().join("bad.vibe"),
        "tool Bad() -> string {\n  const s: string = 123\n  return s\n}\nagent A { model claude-opus-4-8 use Bad }\n",
    )
    .unwrap();

    // Without --ts, the front end is clean.
    vibe().arg("check").arg(dir.path()).assert().success();

    // With --ts, tsc's TS2322 is re-anchored to bad.vibe:2.
    vibe()
        .env("VIBE_TSC", &repo_tsc)
        .arg("check")
        .arg("--ts")
        .arg(dir.path())
        .assert()
        .failure()
        .stderr(predicate::str::contains("TS2322"))
        .stderr(predicate::str::contains("bad.vibe:2"));
}

#[test]
fn new_scaffolds_a_checkable_project() {
    let dir = tempdir().unwrap();
    // Run `vibe new proj` inside the temp dir.
    vibe()
        .current_dir(dir.path())
        .arg("new")
        .arg("proj")
        .assert()
        .success();
    let main = dir.path().join("proj/main.vibe");
    assert!(main.exists());

    // The scaffold must pass `vibe check`.
    vibe()
        .arg("check")
        .arg(dir.path().join("proj"))
        .assert()
        .success();
}
