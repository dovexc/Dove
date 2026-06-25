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
    pub wishlist: Vec<CatalogGame>,
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
    pub min_specs: Option<String>,
    pub recommended_specs: Option<String>,
    pub save_path_hint: Option<String>,
    pub avg_rating: Option<f64>,
    pub review_count: i64,
}

#[derive(Debug, Deserialize)]
pub struct NewCatalogGame {
    pub title: String,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub tags: Option<String>,
    pub min_specs: Option<String>,
    pub recommended_specs: Option<String>,
    pub save_path_hint: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct CloudSave {
    pub catalog_game_id: i64,
    pub size_bytes: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct GameVersionNote {
    pub id: i64,
    pub catalog_game_id: i64,
    pub version: String,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct NewGameVersionNote {
    pub version: String,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct GameEvent {
    pub id: i64,
    pub host_user_id: i64,
    pub host_display_name: String,
    pub title: String,
    pub description: Option<String>,
    pub catalog_game_id: Option<i64>,
    pub catalog_game_title: Option<String>,
    pub custom_game_title: Option<String>,
    pub registration_deadline: Option<String>,
    pub starts_at: Option<String>,
    pub ends_at: Option<String>,
    pub prize_cents: i64,
    pub prize_mode: String,
    pub prize_second_cents: i64,
    pub prize_third_cents: i64,
    pub created_at: String,
    pub participant_count: i64,
    pub joined: bool,
}

#[derive(Debug, Deserialize)]
pub struct NewGameEvent {
    pub title: String,
    pub description: Option<String>,
    pub catalog_game_id: Option<i64>,
    pub custom_game_title: Option<String>,
    pub registration_deadline: Option<String>,
    pub starts_at: Option<String>,
    pub ends_at: Option<String>,
    pub prize_cents: i64,
    pub prize_mode: String,
    #[serde(default)]
    pub prize_second_cents: i64,
    #[serde(default)]
    pub prize_third_cents: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GameScreenshot {
    pub id: i64,
    pub catalog_game_id: i64,
    pub image_url: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct GameReview {
    pub id: i64,
    pub catalog_game_id: i64,
    pub user_id: i64,
    pub reviewer_display_name: String,
    pub rating: f64,
    pub body: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct NewGameReview {
    pub rating: f64,
    pub body: Option<String>,
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
    pub playing_title: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SetPlayingRequest {
    pub catalog_game_id: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct FriendRequests {
    pub incoming: Vec<UserSummary>,
    pub outgoing: Vec<UserSummary>,
}
