export const enum UserAccountStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  SUSPENDED = "suspended",
}

export const enum UserActivityStatusType {
  ACTIVE = "active",
  INACTIVE = "inactive",
}


export enum JWTExpireTime {
  default = "3h",
  remenberMe = "30days",
}



/**
 * `online`, `offline`, `away`, `banned`
 */
export enum UserStatus {
  ONLINE = "online",
  OFFLINE = "offline",
  AWAY = "away",
  BANNED = "banned",
}

