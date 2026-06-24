export interface Game {
  id: number;
  name: string;
  exe_path: string;
  cover_path: string | null;
  description: string | null;
  total_playtime_seconds: number;
  created_at: string;
  size_on_disk_bytes: number;
  last_played_at: string | null;
  is_running: boolean;
  catalog_game_id: number | null;
  installed_version: string | null;
}

export interface UpdateAvailable {
  installed_version: string | null;
  latest_version: string;
  files_to_update: number;
  bytes_to_download: number;
}

export interface NewGame {
  name: string;
  exe_path: string;
  cover_path: string | null;
  description: string | null;
  size_on_disk_bytes?: number | null;
  steam_install_dir?: string | null;
  catalog_game_id?: number | null;
}

export interface UpdateGame {
  name: string;
  exe_path: string;
  cover_path: string | null;
  description: string | null;
  size_on_disk_bytes?: number | null;
}

export interface SteamGame {
  appid: string;
  name: string;
  install_dir: string;
  cover_path: string | null;
  description: string | null;
  size_on_disk_bytes: number;
}

export interface StoreUser {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string | null;
  background_url: string | null;
  bio: string | null;
  created_at: string;
  is_profile_hidden: boolean;
  is_admin: boolean;
}

export interface ProfileScreenshot {
  id: number;
  user_id: number;
  image_url: string;
  created_at: string;
}

export interface PublicProfile {
  id: number;
  display_name: string;
  avatar_url: string | null;
  background_url: string | null;
  bio: string | null;
  created_at: string;
  screenshots: ProfileScreenshot[];
}

export interface UserSummary {
  id: number;
  display_name: string;
  avatar_url: string | null;
  online: boolean;
}

export interface FriendRequests {
  incoming: UserSummary[];
  outgoing: UserSummary[];
}

export interface CatalogGame {
  id: number;
  publisher_user_id: number;
  title: string;
  description: string | null;
  cover_url: string | null;
  price_cents: number;
  created_at: string;
  file_url: string | null;
  file_size_bytes: number | null;
  version: string;
  tags: string | null;
  status: "pending" | "approved" | "rejected";
}

export interface NewCatalogGame {
  title: string;
  description: string | null;
  cover_url: string | null;
  tags: string | null;
}

export interface StorageUsage {
  used_bytes: number;
  quota_bytes: number;
}
