export const READ_COMMANDS = [
  "accinfo",
  "authid",
  "banned",
  "caninfo",
  "cansinfo",
  "coords",
  "enginevolt",
  "get3g",
  "getapn",
  "getcfg",
  "getdinmode",
  "getgfwver",
  "getio",
  "getioparam",
  "getlog",
  "getnetw",
  "getsd",
  "gsminfo",
  "imei",
  "info",
  "iqfinfo",
  "lastchange",
  "modrev",
  "plockinfo",
  "snapshot",
  "ssl status",
  "tacho",
  "tachostatus",
  "uptime",
  "version",
  "webcoords",
];

export const WRITE_COMMANDS = [
  "accreset",
  "ahj-on",
  "ahj-off",
  "clear dtc",
  "clear obd",
  "connect",
  "delrecords",
  "dfota",
  "dmpfconnect",
  "doutreset",
  "econnect",
  "forward",
  "neconnect",
  "nreset",
  "optiver",
  "plock",
  "reset",
  "set3g",
  "setcfg",
  "setconnection",
  "setdinmode",
  "setio",
  "setioparam",
  "setiotime",
  "setlcv",
  "setlock",
  "setnetw",
  "setvalue",
  "switchip",
  "ussd",
];

export const COMMAND_DESCRIPTIONS: Record<string, string> = {
  accinfo: "Account information",
  authid: "Authentication identifiers",
  banned: "Check ban status",
  coords: "Current GPS coordinates",
  enginevolt: "Engine voltage reading",
  getlog: "Retrieve current device logs",
  imei: "Retrieve device IMEI",
  info: "General device information",
  snapshot: "Take a quick snapshot",
  version: "Firmware version",
  "ssl status": "SSL tunnel status",
  accreset: "Reset account linkage",
  "clear dtc": "Clear diagnostic trouble codes",
  connect: "Initiate network connection",
  reset: "Soft reset the device",
  setcfg: "Update configuration profile",
  ussd: "Send USSD command",
  custom: "Send a custom SMS command",
};

export const ALL_COMMANDS = [...READ_COMMANDS, ...WRITE_COMMANDS, "custom"];

export function isWriteCommand(command: string) {
  return WRITE_COMMANDS.includes(command);
}

export function isReadCommand(command: string) {
  return READ_COMMANDS.includes(command);
}

export function isSupportedCommand(command: string) {
  return ALL_COMMANDS.includes(command);
}
