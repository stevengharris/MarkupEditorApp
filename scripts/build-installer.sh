#!/bin/bash
# Wraps an already-notarized, stapled MarkupEditor.app (as exported by Xcode
# Organizer's Direct Distribution flow) into a signed, notarized, stapled
# .pkg installer. Does not archive, export, or notarize the .app itself --
# that workflow is unchanged.
set -euo pipefail

DEFAULT_IDENTITY="Developer ID Installer: Steven Harris (7XXG4VJQ59)"
DEFAULT_NOTARY_PROFILE="markupeditor-notary"
BUNDLE_ID="com.stevengharris.MarkupEditorApp"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

APP=""
OUT="."
IDENTITY="$DEFAULT_IDENTITY"
NOTARY_PROFILE="$DEFAULT_NOTARY_PROFILE"
SKIP_SIGN=0
SKIP_NOTARIZE=0
ALLOW_UNNOTARIZED_APP=0
VARIANT_OVERRIDE=""

usage() {
    cat >&2 <<EOF
Usage: $0 --app <path/to/MarkupEditor.app> [--out <dir>]
          [--identity "<Developer ID Installer identity>"]
          [--notary-profile <name>]
          [--skip-sign] [--skip-notarize] [--allow-unnotarized-app]
          [--variant Eval|Unlimited]

--skip-sign implies --skip-notarize (an unsigned pkg cannot be notarized).
--allow-unnotarized-app relaxes only the input .app's notarization checks,
independent of --skip-sign -- used for local dry runs against a
development-signed build.
--variant is a confirmation, not a source of truth: the actual variant is
always derived from the app's own MarkupEditorEvalVersion (baked in at build
time from the Xcode build setting). If --variant disagrees with what the app
itself says, the script refuses rather than trusting the flag -- a bare
hand-passed flag would make shipping an eval binary labeled Unlimited a
single-typo, unchecked error.
EOF
    exit "${1:-2}"
}

while [ $# -gt 0 ]; do
    case "$1" in
        --app) APP="$2"; shift 2 ;;
        --out) OUT="$2"; shift 2 ;;
        --identity) IDENTITY="$2"; shift 2 ;;
        --notary-profile) NOTARY_PROFILE="$2"; shift 2 ;;
        --skip-sign) SKIP_SIGN=1; shift ;;
        --skip-notarize) SKIP_NOTARIZE=1; shift ;;
        --allow-unnotarized-app) ALLOW_UNNOTARIZED_APP=1; shift ;;
        --variant) VARIANT_OVERRIDE="$2"; shift 2 ;;
        -h|--help) usage 0 ;;
        *) echo "error: unknown argument: $1" >&2; usage ;;
    esac
done

[ -n "$APP" ] || { echo "error: --app is required" >&2; usage; }
if [ "$SKIP_SIGN" -eq 1 ]; then
    SKIP_NOTARIZE=1
fi

# ---------------------------------------------------------------------------
# Step 1: validate the input .app
# ---------------------------------------------------------------------------
[ -d "$APP" ] || { echo "error: not a directory: $APP" >&2; exit 1; }

identifier=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP/Contents/Info.plist")
if [ "$identifier" != "$BUNDLE_ID" ]; then
    echo "error: $APP has CFBundleIdentifier '$identifier', expected '$BUNDLE_ID'" >&2
    exit 1
fi

codesign --verify --deep --strict "$APP"

if [ "$ALLOW_UNNOTARIZED_APP" -eq 0 ]; then
    set +e
    spctl_out=$(spctl -a -vvv -t exec "$APP" 2>&1)
    spctl_status=$?
    set -e
    echo "$spctl_out"
    if [ "$spctl_status" -ne 0 ] || ! echo "$spctl_out" | grep -q "source=Notarized Developer ID"; then
        echo "error: spctl did not accept $APP as notarized Developer ID (status=$spctl_status)" >&2
        exit 1
    fi
    xcrun stapler validate "$APP"
else
    echo "note: --allow-unnotarized-app -- skipping spctl/stapler checks on the input .app"
fi

# ---------------------------------------------------------------------------
# Step 2: the embedded CLI must be present
# ---------------------------------------------------------------------------
cli="$APP/Contents/Resources/bin/markup"
if [ ! -x "$cli" ]; then
    echo "error: embedded CLI not found or not executable at $cli" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 3: read the version from the app itself, never hardcode
# ---------------------------------------------------------------------------
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist")

# ---------------------------------------------------------------------------
# Step 3b: derive the variant (Eval vs. Unlimited) from the app itself
# ---------------------------------------------------------------------------
# MarkupEditorEvalVersion is baked into Info.plist from the MARKUPEDITOR_EVAL_VERSION
# build setting. Empirically confirmed (all four configurations built and
# inspected directly, not assumed): Release-Eval produces the literal string "YES";
# Debug, Release, and Release-AppStore -- none of which define the build setting --
# all produce an empty string, never a missing key and never the unresolved literal
# "$(MARKUPEDITOR_EVAL_VERSION)". The unresolved-literal and missing-key cases are
# still handled defensively below in case that ever changes (e.g. an app built
# before this key existed).
#
# Only the literal YES means eval. Anything else that isn't one of the known
# "not eval" shapes fails loud -- mirroring MARKUPEDITOR_INCLUDE_CLI's existing
# YES/NO/*-error shell build phase (project.pbxproj ~line 370). Guessing the
# variant wrong ships an eval binary to a paying Unlimited customer.
EVAL_MARKER=$(/usr/libexec/PlistBuddy -c "Print :MarkupEditorEvalVersion" "$APP/Contents/Info.plist" 2>/dev/null) || EVAL_MARKER=""
case "$EVAL_MARKER" in
    YES)
        IS_EVAL=1
        ;;
    ""|NO|'$(MARKUPEDITOR_EVAL_VERSION)')
        IS_EVAL=0
        ;;
    *)
        echo "error: $APP has unexpected MarkupEditorEvalVersion '$EVAL_MARKER' (expected 'YES' or empty) -- refusing to guess the variant" >&2
        exit 1
        ;;
esac

if [ -n "$VARIANT_OVERRIDE" ]; then
    case "$VARIANT_OVERRIDE" in
        Eval) OVERRIDE_IS_EVAL=1 ;;
        Unlimited) OVERRIDE_IS_EVAL=0 ;;
        *) echo "error: --variant must be 'Eval' or 'Unlimited', got '$VARIANT_OVERRIDE'" >&2; exit 1 ;;
    esac
    if [ "$OVERRIDE_IS_EVAL" -ne "$IS_EVAL" ]; then
        echo "error: --variant $VARIANT_OVERRIDE disagrees with $APP's own MarkupEditorEvalVersion ('$EVAL_MARKER') -- refusing to override a signal derived from the actual binary" >&2
        exit 1
    fi
fi

# Eval keeps the unadorned name -- README.md already publishes it under
# MarkupEditor-<version>.pkg, so that name cannot change. Only Unlimited gets
# a token, so the two variants never collide at the same path.
if [ "$IS_EVAL" -eq 1 ]; then
    PKG_BASENAME="MarkupEditor-$VERSION"
else
    PKG_BASENAME="MarkupEditor-$VERSION-Unlimited"
fi

mkdir -p "$OUT"

# ---------------------------------------------------------------------------
# Step 3c: refuse to clobber an existing output, before doing any expensive work
# ---------------------------------------------------------------------------
for candidate in "$OUT/$PKG_BASENAME.pkg" "$OUT/$PKG_BASENAME-unsigned.pkg"; do
    if [ -e "$candidate" ]; then
        echo "error: $candidate already exists -- refusing to overwrite" >&2
        exit 1
    fi
done

# ---------------------------------------------------------------------------
# Step 4: stage
# ---------------------------------------------------------------------------
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/root/Applications"
# ditto, not cp -R: cp does not reliably preserve the extended attributes and
# resource forks the signature seals, and a broken seal fails notarization.
ditto "$APP" "$WORK/root/Applications/MarkupEditor.app"

# ---------------------------------------------------------------------------
# Step 5: disable bundle relocation
# ---------------------------------------------------------------------------
# Default relocatable=YES makes Installer overwrite whatever MarkupEditor.app
# it finds anywhere on disk instead of /Applications, leaving the postinstall
# symlink pointing at a path that was never written.
pkgbuild --analyze --root "$WORK/root" "$WORK/component.plist"
plutil -replace 0.BundleIsRelocatable -bool NO "$WORK/component.plist"

# ---------------------------------------------------------------------------
# Step 6: build the component pkg
# ---------------------------------------------------------------------------
pkgbuild --root "$WORK/root" --component-plist "$WORK/component.plist" \
    --identifier "$BUNDLE_ID.pkg" --version "$VERSION" \
    --install-location / --scripts "$SCRIPT_DIR/installer" \
    "$WORK/MarkupEditor-unsigned.pkg"

# ---------------------------------------------------------------------------
# Step 7: sign
# ---------------------------------------------------------------------------
if [ "$SKIP_SIGN" -eq 0 ]; then
    FINAL_PKG="$OUT/$PKG_BASENAME.pkg"
    # productsign as a separate step (rather than pkgbuild --sign) is what
    # makes --skip-sign a one-line branch.
    productsign --sign "$IDENTITY" "$WORK/MarkupEditor-unsigned.pkg" "$FINAL_PKG"
    sig_out=$(pkgutil --check-signature "$FINAL_PKG")
    echo "$sig_out"
    if ! echo "$sig_out" | grep -q "Developer ID Installer"; then
        echo "error: $FINAL_PKG is not signed with a Developer ID Installer certificate" >&2
        exit 1
    fi
else
    FINAL_PKG="$OUT/$PKG_BASENAME-unsigned.pkg"
    cp "$WORK/MarkupEditor-unsigned.pkg" "$FINAL_PKG"
    echo "note: --skip-sign -- produced an unsigned pkg: $FINAL_PKG"
fi

# ---------------------------------------------------------------------------
# Step 8: notarize
# ---------------------------------------------------------------------------
if [ "$SKIP_NOTARIZE" -eq 0 ]; then
    set +e
    submit_out=$(xcrun notarytool submit "$FINAL_PKG" --keychain-profile "$NOTARY_PROFILE" --wait 2>&1)
    submit_status=$?
    set -e
    echo "$submit_out"
    if [ "$submit_status" -ne 0 ] || ! echo "$submit_out" | grep -q "status: Accepted"; then
        # set +e: a grep no-match here must not abort the script via errexit --
        # this whole block exists to print diagnostics for the failure already
        # detected above, so losing it here would hide the reason it happened.
        set +e
        submission_id=$(echo "$submit_out" | grep -oE 'id: [a-f0-9-]+' | head -1 | awk '{print $2}')
        set -e
        if [ -n "${submission_id:-}" ]; then
            echo "fetching notarization log for $submission_id..." >&2
            xcrun notarytool log "$submission_id" --keychain-profile "$NOTARY_PROFILE" >&2 || true
        fi
        echo "error: notarization did not succeed" >&2
        exit 1
    fi

    xcrun stapler staple "$FINAL_PKG"
    xcrun stapler validate "$FINAL_PKG"

    set +e
    # -t install, not -t exec: exec is for executables/apps, install is for pkgs.
    install_out=$(spctl -a -vvv -t install "$FINAL_PKG" 2>&1)
    install_status=$?
    set -e
    echo "$install_out"
    if [ "$install_status" -ne 0 ] || ! echo "$install_out" | grep -q "Notarized Developer ID"; then
        echo "error: spctl did not accept $FINAL_PKG as notarized Developer ID" >&2
        exit 1
    fi
else
    echo "note: --skip-notarize -- pkg is not notarized"
fi

# ---------------------------------------------------------------------------
# Step 9
# ---------------------------------------------------------------------------
echo "Built: $FINAL_PKG (version $VERSION)"
