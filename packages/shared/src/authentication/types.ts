export type AuthInfo = {
  id: string;
  type: "user" | "workspace";
};

export type CachedAuthDetails = {
  accessToken: string;
  refreshToken: string;
};
