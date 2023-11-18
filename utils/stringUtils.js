'use strict'

/**
 * Format string like this and fill variables in ${} with real data:
 *
 * Name=${appName} Comment=${appName} Type=Application Exec=${commandLine} Icon=${icon}
 *
 */
export const format = function(stringTemplate, argumentsObj) {
  const obj = argumentsObj;
  if (typeof obj !== 'object') {
    throw(new Error('Wrong arguments, only supports object'));
  }

  for (const key in obj) {
    stringTemplate = stringTemplate.replaceAll("${" + key + "}", obj[key]);
  }
  return stringTemplate;
}
