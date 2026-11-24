#!/bin/bash
# boot a simulator, install the Release build, launch Solshot, screenshot, collect logs.
# usage: bash scripts/shoot.sh <device-name> <sim-device-type-id>
set +e
NAME="$1"
TYPE="$2"
BUNDLE=$(cat "$RUNNER_TEMP/bundle.txt")
APP=$(find "$RUNNER_TEMP/dd/Build/Products/Release-iphonesimulator" -maxdepth 1 -name "*.app" | head -1)
echo "bundle=$BUNDLE app=$APP"
if [ -z "$APP" ]; then echo "no .app found"; exit 1; fi
mkdir -p out logs

UDID=$(xcrun simctl create "$NAME" "$TYPE" com.apple.CoreSimulator.SimRuntime.iOS-27-0)
if [ -z "$UDID" ]; then echo "create failed: $NAME $TYPE"; exit 1; fi
echo "created $NAME udid=$UDID"

xcrun simctl boot "$UDID" || true
timeout 300 xcrun simctl bootstatus "$UDID" -b || echo "bootstatus timeout"
sleep 6

echo "install $NAME:"
timeout 240 xcrun simctl install "$UDID" "$APP" || echo "install timeout"

for attempt in 1 2 3; do
  echo "launch attempt $attempt for $NAME:"
  timeout 60 xcrun simctl launch "$UDID" "$BUNDLE" 2>&1
  sleep 35
  COUNT=$(timeout 30 xcrun simctl spawn "$UDID" launchctl list 2>/dev/null | grep -c "$BUNDLE")
  echo "running_count=$COUNT"
  if [ "${COUNT:-0}" -gt 0 ]; then break; fi
  echo "not running, retrying"
done

sleep 4
xcrun simctl io "$UDID" screenshot "out/$NAME.png"

xcrun simctl spawn "$UDID" log show --last 4m --style compact \
  --predicate 'processImagePath CONTAINS "Solshot" OR senderImagePath CONTAINS "Solshot"' \
  2>/dev/null | tail -60 > "logs/$NAME-app.log" || true
xcrun simctl spawn "$UDID" log show --last 4m --style compact \
  --predicate 'eventMessage CONTAINS "Solshot"' 2>/dev/null | tail -60 > "logs/$NAME-sys.log" || true
ls -1t ~/Library/Logs/DiagnosticReports 2>/dev/null | head -5 > "logs/$NAME-crash-index.txt" || true

xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
xcrun simctl shutdown "$UDID" 2>/dev/null || true
sips -g pixelWidth -g pixelHeight "out/$NAME.png"
