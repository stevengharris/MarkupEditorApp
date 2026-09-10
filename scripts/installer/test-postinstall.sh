#!/bin/sh
# Exercises scripts/installer/postinstall against a fake root under mktemp -d,
# as a non-root user, via the MARKUP_APP/MARKUP_BIN_DIR env overrides.

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
POSTINSTALL="$SCRIPT_DIR/postinstall"

pass_count=0
fail_count=0

pass() {
    pass_count=$((pass_count + 1))
    echo "ok - $1"
}

fail() {
    fail_count=$((fail_count + 1))
    echo "FAIL - $1"
}

# Creates a fake MarkupEditor.app at $1 with an executable stub CLI inside it.
make_fake_app() {
    app="$1"
    mkdir -p "$app/Contents/Resources/bin"
    printf '#!/bin/sh\nexit 0\n' > "$app/Contents/Resources/bin/markup"
    chmod 755 "$app/Contents/Resources/bin/markup"
}

# Runs postinstall against $MARKUP_APP/$MARKUP_BIN_DIR, captures exit status
# into $status.
run_postinstall() {
    sh "$POSTINSTALL" >/tmp/postinstall-test-out.$$ 2>&1
    status=$?
    output=$(cat /tmp/postinstall-test-out.$$)
    rm -f /tmp/postinstall-test-out.$$
}

# --- 1. no LINK, MARKUP_BIN_DIR does not exist -----------------------------
root=$(mktemp -d)
export MARKUP_APP="$root/Applications/MarkupEditor.app"
export MARKUP_BIN_DIR="$root/usr/local/bin"
make_fake_app "$MARKUP_APP"
run_postinstall
if [ "$status" -eq 0 ] && [ -L "$MARKUP_BIN_DIR/markup" ] \
   && [ "$(readlink "$MARKUP_BIN_DIR/markup")" = "$MARKUP_APP/Contents/Resources/bin/markup" ]; then
    pass "1: bin dir created, symlink created"
else
    fail "1: bin dir created, symlink created (status=$status)"
fi
rm -rf "$root"

# --- 2. no LINK, MARKUP_BIN_DIR exists --------------------------------------
root=$(mktemp -d)
export MARKUP_APP="$root/Applications/MarkupEditor.app"
export MARKUP_BIN_DIR="$root/usr/local/bin"
make_fake_app "$MARKUP_APP"
mkdir -p "$MARKUP_BIN_DIR"
run_postinstall
if [ "$status" -eq 0 ] && [ -L "$MARKUP_BIN_DIR/markup" ] \
   && [ "$(readlink "$MARKUP_BIN_DIR/markup")" = "$MARKUP_APP/Contents/Resources/bin/markup" ]; then
    pass "2: symlink created into existing bin dir"
else
    fail "2: symlink created into existing bin dir (status=$status)"
fi
rm -rf "$root"

# --- 3. LINK is an unrelated regular file -----------------------------------
root=$(mktemp -d)
export MARKUP_APP="$root/Applications/MarkupEditor.app"
export MARKUP_BIN_DIR="$root/usr/local/bin"
make_fake_app "$MARKUP_APP"
mkdir -p "$MARKUP_BIN_DIR"
printf 'not markupeditor\n' > "$MARKUP_BIN_DIR/markup"
before=$(cat "$MARKUP_BIN_DIR/markup")
run_postinstall
after=$(cat "$MARKUP_BIN_DIR/markup")
if [ "$status" -eq 0 ] && [ ! -L "$MARKUP_BIN_DIR/markup" ] && [ "$before" = "$after" ] \
   && [ -n "$output" ]; then
    pass "3: unrelated regular file left untouched, warning printed"
else
    fail "3: unrelated regular file left untouched, warning printed (status=$status)"
fi
rm -rf "$root"

# --- 4. LINK is a symlink to an unrelated target ----------------------------
root=$(mktemp -d)
export MARKUP_APP="$root/Applications/MarkupEditor.app"
export MARKUP_BIN_DIR="$root/usr/local/bin"
make_fake_app "$MARKUP_APP"
mkdir -p "$MARKUP_BIN_DIR"
ln -s /usr/bin/true "$MARKUP_BIN_DIR/markup"
run_postinstall
if [ "$status" -eq 0 ] && [ -L "$MARKUP_BIN_DIR/markup" ] \
   && [ "$(readlink "$MARKUP_BIN_DIR/markup")" = "/usr/bin/true" ] && [ -n "$output" ]; then
    pass "4: unrelated symlink left untouched, warning printed"
else
    fail "4: unrelated symlink left untouched, warning printed (status=$status)"
fi
rm -rf "$root"

# --- 5. LINK is a symlink into an OLD MarkupEditor.app (upgrade) -----------
root=$(mktemp -d)
export MARKUP_APP="$root/Applications/MarkupEditor.app"
export MARKUP_BIN_DIR="$root/usr/local/bin"
make_fake_app "$MARKUP_APP"
old_app="$root/OldLocation/MarkupEditor.app"
make_fake_app "$old_app"
mkdir -p "$MARKUP_BIN_DIR"
ln -s "$old_app/Contents/Resources/bin/markup" "$MARKUP_BIN_DIR/markup"
run_postinstall
if [ "$status" -eq 0 ] \
   && [ "$(readlink "$MARKUP_BIN_DIR/markup")" = "$MARKUP_APP/Contents/Resources/bin/markup" ]; then
    pass "5: upgrade repoints old MarkupEditor symlink"
else
    fail "5: upgrade repoints old MarkupEditor symlink (status=$status)"
fi
rm -rf "$root"

# --- 6. LINK is a dangling symlink into a MarkupEditor.app path ------------
root=$(mktemp -d)
export MARKUP_APP="$root/Applications/MarkupEditor.app"
export MARKUP_BIN_DIR="$root/usr/local/bin"
make_fake_app "$MARKUP_APP"
mkdir -p "$MARKUP_BIN_DIR"
ln -s "$root/Gone/MarkupEditor.app/Contents/Resources/bin/markup" "$MARKUP_BIN_DIR/markup"
run_postinstall
if [ "$status" -eq 0 ] \
   && [ "$(readlink "$MARKUP_BIN_DIR/markup")" = "$MARKUP_APP/Contents/Resources/bin/markup" ]; then
    pass "6: dangling MarkupEditor symlink repaired"
else
    fail "6: dangling MarkupEditor symlink repaired (status=$status)"
fi
rm -rf "$root"

# --- 7. LINK is a directory -------------------------------------------------
root=$(mktemp -d)
export MARKUP_APP="$root/Applications/MarkupEditor.app"
export MARKUP_BIN_DIR="$root/usr/local/bin"
make_fake_app "$MARKUP_APP"
mkdir -p "$MARKUP_BIN_DIR/markup"
run_postinstall
if [ "$status" -eq 0 ] && [ -d "$MARKUP_BIN_DIR/markup" ] && [ ! -L "$MARKUP_BIN_DIR/markup" ]; then
    pass "7: directory at the link path left untouched"
else
    fail "7: directory at the link path left untouched (status=$status)"
fi
rm -rf "$root"

# --- 8. idempotency: run twice back to back ---------------------------------
root=$(mktemp -d)
export MARKUP_APP="$root/Applications/MarkupEditor.app"
export MARKUP_BIN_DIR="$root/usr/local/bin"
make_fake_app "$MARKUP_APP"
run_postinstall
first_status=$status
first_target=$(readlink "$MARKUP_BIN_DIR/markup" 2>/dev/null)
run_postinstall
second_status=$status
second_target=$(readlink "$MARKUP_BIN_DIR/markup" 2>/dev/null)
if [ "$first_status" -eq 0 ] && [ "$second_status" -eq 0 ] && [ "$first_target" = "$second_target" ]; then
    pass "8: idempotent across two runs"
else
    fail "8: idempotent across two runs (status=$first_status,$second_status)"
fi
rm -rf "$root"

# --- 9. embedded CLI missing from the fake app ------------------------------
root=$(mktemp -d)
export MARKUP_APP="$root/Applications/MarkupEditor.app"
export MARKUP_BIN_DIR="$root/usr/local/bin"
mkdir -p "$MARKUP_APP/Contents/Resources/bin"   # no markup binary inside
run_postinstall
if [ "$status" -eq 0 ] && [ ! -e "$MARKUP_BIN_DIR/markup" ]; then
    pass "9: no symlink created when embedded CLI is missing"
else
    fail "9: no symlink created when embedded CLI is missing (status=$status)"
fi
rm -rf "$root"

# --- 10. real $3 positional arg, no MARKUP_APP/MARKUP_BIN_DIR override -----
# Every prior case bypasses the target_vol/$3 defaulting logic entirely via
# env overrides -- this is the only case exercising the code path a real
# Installer.app-driven install actually invokes.
root=$(mktemp -d)
unset MARKUP_APP MARKUP_BIN_DIR
make_fake_app "$root/Applications/MarkupEditor.app"
sh "$POSTINSTALL" "" "" "$root/" >/tmp/postinstall-test-out.$$ 2>&1
status=$?
output=$(cat /tmp/postinstall-test-out.$$)
rm -f /tmp/postinstall-test-out.$$
if [ "$status" -eq 0 ] && [ -L "$root/usr/local/bin/markup" ] \
   && [ "$(readlink "$root/usr/local/bin/markup")" = "$root/Applications/MarkupEditor.app/Contents/Resources/bin/markup" ]; then
    pass "10: real \$3 positional arg, no env override"
else
    fail "10: real \$3 positional arg, no env override (status=$status)"
fi
rm -rf "$root"

echo
echo "$pass_count passed, $fail_count failed"
[ "$fail_count" -eq 0 ]
