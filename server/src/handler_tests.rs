//! Handler-level regression tests. These call the axum handler functions
//! directly (no HTTP layer) against an in-memory database, so each test
//! exercises the real SQL/business logic without spinning up a server.
//! `AuthUser`/`AdminUser` are constructed directly rather than parsed from
//! a request — that's intentional: these tests are about what each
//! handler *does* once authenticated, not about token parsing (covered
//! separately below).

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::Json;

use crate::auth::{create_token, AdminUser, AuthUser};
use crate::handlers::*;
use crate::models::*;
use crate::state::AppState;

async fn register_user(state: &AppState, email: &str, password: &str, name: &str) -> User {
    register(
        State(state.clone()),
        Json(RegisterRequest {
            email: email.to_string(),
            password: password.to_string(),
            display_name: name.to_string(),
        }),
    )
    .await
    .expect("register should succeed")
    .0
    .user
}

fn bearer_headers(state: &AppState, user_id: i64) -> HeaderMap {
    let token = create_token(user_id, &state.jwt_secret).expect("token");
    let mut headers = HeaderMap::new();
    headers.insert(
        "authorization",
        HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
    );
    headers
}

// ---- auth ----

#[tokio::test]
async fn login_succeeds_with_correct_password_and_fails_with_wrong_one() {
    let state = AppState::for_tests();
    register_user(&state, "a@test.de", "correct-password", "Alice").await;

    let ok = login(
        State(state.clone()),
        Json(LoginRequest {
            email: "a@test.de".to_string(),
            password: "correct-password".to_string(),
        }),
    )
    .await;
    assert!(ok.is_ok());

    let err = login(
        State(state.clone()),
        Json(LoginRequest {
            email: "a@test.de".to_string(),
            password: "wrong-password".to_string(),
        }),
    )
    .await;
    assert_eq!(err.unwrap_err().0, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn admin_emails_grant_role_on_register_and_survive_relogin_without_relisting() {
    let mut state = AppState::for_tests();
    state.admin_emails = vec!["boss@test.de".to_string()];

    let user = register_user(&state, "boss@test.de", "password123", "Boss").await;
    assert!(user.is_admin);

    // Even after the env list would no longer "cover" them, logging in
    // again must not revoke a role that was already granted.
    state.admin_emails.clear();
    let relogged_in = login(
        State(state.clone()),
        Json(LoginRequest {
            email: "boss@test.de".to_string(),
            password: "password123".to_string(),
        }),
    )
    .await
    .unwrap()
    .0
    .user;
    assert!(relogged_in.is_admin);
}

// ---- catalog moderation ----

#[tokio::test]
async fn new_games_are_pending_and_hidden_from_public_catalog_until_approved() {
    let state = AppState::for_tests();
    let publisher = register_user(&state, "pub@test.de", "password123", "Pub").await;

    let game = create_game(
        State(state.clone()),
        AuthUser(publisher.id),
        Json(NewCatalogGame {
            title: "Unreleased Game".to_string(),
            description: None,
            cover_url: None,
            tags: None,
        }),
    )
    .await
    .unwrap()
    .0;
    assert_eq!(game.status, "pending");

    // Anonymous catalog browsing must not see it.
    let public_list = list_games(State(state.clone()), HeaderMap::new())
        .await
        .unwrap()
        .0;
    assert!(public_list.iter().all(|g| g.id != game.id));

    // The publisher themselves should still see it (e.g. to upload a build).
    let own_headers = bearer_headers(&state, publisher.id);
    let own_list = list_games(State(state.clone()), own_headers.clone())
        .await
        .unwrap()
        .0;
    assert!(own_list.iter().any(|g| g.id == game.id));

    // A stranger can't fetch it directly by id either.
    let stranger = register_user(&state, "stranger@test.de", "password123", "Stranger").await;
    let stranger_headers = bearer_headers(&state, stranger.id);
    let get_as_stranger = get_game(
        State(state.clone()),
        stranger_headers,
        Path(game.id),
    )
    .await;
    assert_eq!(get_as_stranger.unwrap_err().0, StatusCode::NOT_FOUND);

    // Approve it — now it's public.
    let approved = approve_game(State(state.clone()), AdminUser(999), Path(game.id))
        .await
        .unwrap()
        .0;
    assert_eq!(approved.status, "approved");
    let public_list_after = list_games(State(state.clone()), HeaderMap::new())
        .await
        .unwrap()
        .0;
    assert!(public_list_after.iter().any(|g| g.id == game.id));
}

// ---- friends ----

#[tokio::test]
async fn friend_request_accept_and_remove_round_trip() {
    let state = AppState::for_tests();
    let alice = register_user(&state, "alice@test.de", "password123", "Alice").await;
    let bob = register_user(&state, "bob@test.de", "password123", "Bob").await;

    send_friend_request(State(state.clone()), AuthUser(alice.id), Path(bob.id))
        .await
        .unwrap();

    let bob_requests = list_friend_requests(State(state.clone()), AuthUser(bob.id))
        .await
        .unwrap()
        .0;
    assert_eq!(bob_requests.incoming.len(), 1);
    assert_eq!(bob_requests.incoming[0].id, alice.id);

    accept_friend_request(State(state.clone()), AuthUser(bob.id), Path(alice.id))
        .await
        .unwrap();

    let alice_friends = list_friends(State(state.clone()), AuthUser(alice.id))
        .await
        .unwrap()
        .0;
    let bob_friends = list_friends(State(state.clone()), AuthUser(bob.id))
        .await
        .unwrap()
        .0;
    assert!(alice_friends.iter().any(|f| f.id == bob.id));
    assert!(bob_friends.iter().any(|f| f.id == alice.id));

    remove_friend(State(state.clone()), AuthUser(alice.id), Path(bob.id))
        .await
        .unwrap();
    let alice_friends_after = list_friends(State(state.clone()), AuthUser(alice.id))
        .await
        .unwrap()
        .0;
    assert!(alice_friends_after.iter().all(|f| f.id != bob.id));
}

#[tokio::test]
async fn cannot_friend_request_yourself() {
    let state = AppState::for_tests();
    let alice = register_user(&state, "alice2@test.de", "password123", "Alice").await;

    let result = send_friend_request(State(state.clone()), AuthUser(alice.id), Path(alice.id))
        .await;
    assert_eq!(result.unwrap_err().0, StatusCode::BAD_REQUEST);
}

// ---- privacy ----

#[tokio::test]
async fn hidden_profile_is_excluded_from_search_but_visible_to_friends() {
    let state = AppState::for_tests();
    let alice = register_user(&state, "alice3@test.de", "password123", "Alice").await;
    let hidden = register_user(&state, "hidden@test.de", "password123", "HiddenPerson").await;

    let _ = update_profile(
        State(state.clone()),
        AuthUser(hidden.id),
        Json(UpdateProfileRequest {
            display_name: None,
            bio: None,
            is_profile_hidden: Some(true),
        }),
    )
    .await
    .unwrap();

    let search_results = search_users(
        State(state.clone()),
        AuthUser(alice.id),
        Query(SearchUsersQuery {
            q: Some("HiddenPerson".to_string()),
        }),
    )
    .await
    .unwrap()
    .0;
    assert!(search_results.iter().all(|u| u.id != hidden.id));

    // Stranger can't view the hidden profile directly.
    let as_stranger = get_user_profile(State(state.clone()), AuthUser(alice.id), Path(hidden.id))
        .await;
    assert_eq!(as_stranger.unwrap_err().0, StatusCode::NOT_FOUND);

    // Once friends, the profile becomes visible again.
    send_friend_request(State(state.clone()), AuthUser(alice.id), Path(hidden.id))
        .await
        .unwrap();
    accept_friend_request(State(state.clone()), AuthUser(hidden.id), Path(alice.id))
        .await
        .unwrap();
    let as_friend = get_user_profile(State(state.clone()), AuthUser(alice.id), Path(hidden.id))
        .await;
    assert!(as_friend.is_ok());
}

// ---- admin role management ----

#[tokio::test]
async fn promote_and_demote_user_toggles_admin_flag() {
    let state = AppState::for_tests();
    let target = register_user(&state, "target@test.de", "password123", "Target").await;
    assert!(!target.is_admin);

    promote_user(State(state.clone()), AdminUser(999), Path(target.id))
        .await
        .unwrap();
    let admin_list = list_users_for_admin(
        State(state.clone()),
        AdminUser(999),
        Query(AdminUsersQuery {
            q: Some("Target".to_string()),
        }),
    )
    .await
    .unwrap()
    .0;
    assert!(admin_list.iter().find(|u| u.id == target.id).unwrap().is_admin);

    demote_user(State(state.clone()), AdminUser(999), Path(target.id))
        .await
        .unwrap();
    let admin_list_after = list_users_for_admin(
        State(state.clone()),
        AdminUser(999),
        Query(AdminUsersQuery {
            q: Some("Target".to_string()),
        }),
    )
    .await
    .unwrap()
    .0;
    assert!(!admin_list_after.iter().find(|u| u.id == target.id).unwrap().is_admin);
}

#[tokio::test]
async fn admin_cannot_demote_themselves() {
    let state = AppState::for_tests();
    let admin = register_user(&state, "selfadmin@test.de", "password123", "SelfAdmin").await;
    promote_user(State(state.clone()), AdminUser(999), Path(admin.id))
        .await
        .unwrap();

    let result = demote_user(State(state.clone()), AdminUser(admin.id), Path(admin.id)).await;
    assert_eq!(result.unwrap_err().0, StatusCode::BAD_REQUEST);
}

// ---- rate limiting ----

#[test]
fn rate_limiter_blocks_after_max_requests_within_window() {
    use crate::rate_limit::RateLimiter;
    use std::time::Duration;

    let limiter = RateLimiter::new(2, Duration::from_secs(60));
    assert!(limiter.check("1.2.3.4"));
    assert!(limiter.check("1.2.3.4"));
    assert!(!limiter.check("1.2.3.4"));
    // A different key has its own budget.
    assert!(limiter.check("5.6.7.8"));
}

// ---- AdminUser extractor: real HTTP-header-based access control ----

#[tokio::test]
async fn admin_extractor_rejects_non_admin_and_accepts_admin() {
    use axum::extract::FromRequestParts;

    let state = AppState::for_tests();
    let regular = register_user(&state, "regular@test.de", "password123", "Regular").await;
    let admin = register_user(&state, "realadmin@test.de", "password123", "RealAdmin").await;
    promote_user(State(state.clone()), AdminUser(999), Path(admin.id))
        .await
        .unwrap();

    async fn extract_admin(
        state: &AppState,
        user_id: i64,
    ) -> Result<AdminUser, (StatusCode, String)> {
        let token = create_token(user_id, &state.jwt_secret).unwrap();
        let request = axum::http::Request::builder()
            .header("authorization", format!("Bearer {token}"))
            .body(())
            .unwrap();
        let (mut parts, _) = request.into_parts();
        AdminUser::from_request_parts(&mut parts, state).await
    }

    assert_eq!(
        extract_admin(&state, regular.id).await.unwrap_err().0,
        StatusCode::FORBIDDEN
    );
    assert!(extract_admin(&state, admin.id).await.is_ok());
}
