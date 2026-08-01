import geoip from "geoip-lite";
import {UAParser} from "ua-parser-js";
/**
 * @param ipAddress -filter cloudflare ip address and get the real ip address
 * @returns `ipAddress`, `country`, `city`, `latitude`, `longitude`, `timezone`
 * @see https://www.npmjs.com/package/geoip-lite
 */
export const getLocation = (ipAddress: string) => {
  if (ipAddress === "::1" || ipAddress === "127.0.0.1") {
    return {
      ipAddress,
      country: "Localhost",
      city: "Localhost",
      latitude: 0,
      longitude: 0,
      timezone: "Localhost",
    };
  }
  const geo = geoip.lookup(ipAddress);
  return {
    ipAddress,
    country: geo?.country,
    city: geo?.city,
    latitude: geo?.ll[0],
    longitude: geo?.ll[1],
    timezone: geo?.timezone,
  };
};

export const getDeviceInfo = (userAgent: string) => {
  const parser = new UAParser(userAgent);
  const data = parser.getResult();
  return {
    os: data.os.name || "Unknown",
    DeviceType: data.device.type || "unknown",
    browser: data.browser.name || "Unknown",
    deviceVendor: data.device.vendor || "Unknown",
  };
};
