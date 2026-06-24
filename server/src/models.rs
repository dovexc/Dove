use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct User {
    pub id: i64,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub background_url: Option<String>,
    pub bio: Option<String>,
    pub created_at: String,
    pub is_profile_hidden: bool,
    pub is_admin: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PublicProfile {
    pub id: i64,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub background_url: Option<String>,
    pub bio: Option<String>,
    pub created_at: String,
    pub screenshots: Vec<ProfileScreenshot>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProfileScreenshot {
    pub id: i64,
    pub user_id: i64,
    pub image_url: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub is_profile_hidden: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct ImageUpload {
    pub image: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub display_name: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CatalogGame {
    pub id: i64,
    pub publisher_user_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub price_cents: i64,
    pub created_at: String,
    pub file_url: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub version: String,
    pub tags: Option<String>,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct NewCatalogGame {
    pub title: String,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub tags: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ManifestFile {
    pub relative_path: String,
    pub sha256: String,
    pub size_bytes: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct GameManifest {
    pub version: String,
    pub files: Vec<ManifestFile>,
}

#[derive(Debug, Serialize, Clone)]
pub struct StorageUsage {
    pub used_bytes: i64,
    pub quota_bytes: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct UserSummary {
    pub id: i64,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub online: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct FriendRequests {
    pub incoming: Vec<UserSummary>,
    pub outgoing: Vec<UserSummary>,
}
