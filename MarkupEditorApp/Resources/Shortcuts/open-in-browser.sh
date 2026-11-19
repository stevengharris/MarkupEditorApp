# Open in Browser: export the open Markdown document to HTML and open it in the default browser.
#
# Requirements for a Shortcut script that runs from MarkupEditor:
#  - In the Shortcuts app, Settings > Advanced > Allow Running Scripts must be on.
#  - MarkupEditor passes the path of the open document as the Shortcut's text input, which the script reads
#    as $1. It is the saved file, so unsaved edits are not in it. $1 is empty for an untitled document, or
#    when the Shortcut is run from the Shortcuts app; `markup current --saved` then asks the running
#    MarkupEditor, but that makes macOS ask whether Shortcuts may access data from other apps each time
#    Shortcuts starts, so prefer $1.
#  - Use full paths to tools or set PATH here. A Shortcut's PATH can differ from the one in Terminal.
#  - Whatever the script prints is kept in the Log File. A script that exits 0 is reported as succeeded.
#  - A script that exits non-zero is reported as failed with its exit code, but Shortcuts discards what it printed.
#    To keep the output of a failure, print exit=<n> (n is the exit code) as the last line, then end with `exit 0`.
#    MarkupEditor reports the run as failed with that code and shows the output, as this script does.
if [ -n "$1" ]; then
  file="$1"
  code=0
else
  file="$(markup current --saved 2>&1)"
  code=$?
fi
if [ $code -ne 0 ]; then
  echo "$file"
else
  page="$(mktemp -d)/$(basename "${file%.*}").html"
  markup export --format html --images embed --output "$page" "$file" 2>&1
  code=$?
  if [ $code -eq 0 ]; then
    echo "Exported to $page"
    open "$page" 2>&1
    code=$?
  fi
fi
echo "exit=$code"
exit 0
