if ! pgrep -f "${cmdString}" | grep -v "$$"; then
  ${cmdString} > /dev/null &
  echo $! >&1
else
  # App must be started or running
  # See: https://tldp.org/LDP/abs/html/exitcodes.html#EXITCODESREF
  exit 79
fi

