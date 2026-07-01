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
            language: None,
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

#[sqlx::test]
async fn login_succeeds_with_correct_password_and_fails_with_wrong_one(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
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

#[sqlx::test]
async fn admin_emails_grant_role_on_register_and_survive_relogin_without_relisting(pool: sqlx::PgPool) {
    let mut state = AppState::for_tests(pool).await;
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

#[sqlx::test]
async fn new_games_are_pending_and_hidden_from_public_catalog_until_approved(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
    let publisher = register_user(&state, "pub@test.de", "password123", "Pub").await;

    let game = create_game(
        State(state.clone()),
        AuthUser(publisher.id),
        Json(NewCatalogGame {
            title: "Unreleased Game".to_string(),
            description: None,
            cover_url: None,
            tags: None,
            min_specs: None,
            recommended_specs: None,
            save_path_hint: None,
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

#[sqlx::test]
async fn friend_request_accept_and_remove_round_trip(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
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

#[sqlx::test]
async fn cannot_friend_request_yourself(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
    let alice = register_user(&state, "alice2@test.de", "password123", "Alice").await;

    let result = send_friend_request(State(state.clone()), AuthUser(alice.id), Path(alice.id))
        .await;
    assert_eq!(result.unwrap_err().0, StatusCode::BAD_REQUEST);
}

// ---- privacy ----

#[sqlx::test]
async fn hidden_profile_is_excluded_from_search_but_visible_to_friends(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
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

#[sqlx::test]
async fn promote_and_demote_user_toggles_admin_flag(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
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

#[sqlx::test]
async fn admin_cannot_demote_themselves(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
    let admin = register_user(&state, "selfadmin@test.de", "password123", "SelfAdmin").await;
    promote_user(State(state.clone()), AdminUser(999), Path(admin.id))
        .await
        .unwrap();

    let result = demote_user(State(state.clone()), AdminUser(admin.id), Path(admin.id)).await;
    assert_eq!(result.unwrap_err().0, StatusCode::BAD_REQUEST);
}

// ---- notifications ----

#[sqlx::test]
async fn friend_request_and_accept_each_notify_the_other_party(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
    let alice = register_user(&state, "nalice@test.de", "password123", "Alice").await;
    let bob = register_user(&state, "nbob@test.de", "password123", "Bob").await;

    send_friend_request(State(state.clone()), AuthUser(alice.id), Path(bob.id))
        .await
        .unwrap();
    let bob_notifications = list_notifications(State(state.clone()), AuthUser(bob.id))
        .await
        .unwrap()
        .0;
    assert_eq!(bob_notifications.len(), 1);
    assert_eq!(bob_notifications[0].kind, "friend_request");
    assert!(!bob_notifications[0].is_read);

    accept_friend_request(State(state.clone()), AuthUser(bob.id), Path(alice.id))
        .await
        .unwrap();
    let alice_notifications = list_notifications(State(state.clone()), AuthUser(alice.id))
        .await
        .unwrap()
        .0;
    assert_eq!(alice_notifications.len(), 1);
    assert_eq!(alice_notifications[0].kind, "friend_accepted");

    // Marking one as read doesn't touch the other user's notifications.
    mark_notification_read(
        State(state.clone()),
        AuthUser(bob.id),
        Path(bob_notifications[0].id),
    )
    .await
    .unwrap();
    let bob_after = list_notifications(State(state.clone()), AuthUser(bob.id))
        .await
        .unwrap()
        .0;
    assert!(bob_after[0].is_read);
    let alice_after = list_notifications(State(state.clone()), AuthUser(alice.id))
        .await
        .unwrap()
        .0;
    assert!(!alice_after[0].is_read);

    mark_all_notifications_read(State(state.clone()), AuthUser(alice.id))
        .await
        .unwrap();
    let alice_final = list_notifications(State(state.clone()), AuthUser(alice.id))
        .await
        .unwrap()
        .0;
    assert!(alice_final.iter().all(|n| n.is_read));
}

#[sqlx::test]
async fn match_result_notifies_both_sides_and_team_join_notifies_teammates(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
    let host = register_user(&state, "mnhost@test.de", "password123", "Host").await;
    let a1 = register_user(&state, "mna1@test.de", "password123", "A1").await;
    let a2 = register_user(&state, "mna2@test.de", "password123", "A2").await;
    let b1 = register_user(&state, "mnb1@test.de", "password123", "B1").await;
    let b2 = register_user(&state, "mnb2@test.de", "password123", "B2").await;

    let event = create_event(
        State(state.clone()),
        AuthUser(host.id),
        Json(new_event_req("Notify Cup", 2, None, "knockout", false)),
    )
    .await
    .unwrap()
    .0;

    let team_a = create_event_team(
        State(state.clone()),
        AuthUser(a1.id),
        Path(event.id),
        Json(NewEventTeam { name: "Team A".to_string(), code: None }),
    )
    .await
    .unwrap()
    .0;
    let _ = join_event_team(
        State(state.clone()),
        AuthUser(a2.id),
        Path((event.id, team_a.id)),
        Json(JoinWithCode::default()),
    )
    .await
    .unwrap();
    // A1 (the team creator) should be notified that A2 joined.
    let a1_notifications = list_notifications(State(state.clone()), AuthUser(a1.id))
        .await
        .unwrap()
        .0;
    assert!(a1_notifications.iter().any(|n| n.kind == "team_joined"));

    let team_b = create_event_team(
        State(state.clone()),
        AuthUser(b1.id),
        Path(event.id),
        Json(NewEventTeam { name: "Team B".to_string(), code: None }),
    )
    .await
    .unwrap()
    .0;
    let _ = join_event_team(
        State(state.clone()),
        AuthUser(b2.id),
        Path((event.id, team_b.id)),
        Json(JoinWithCode::default()),
    )
    .await
    .unwrap();

    let bracket = start_event_tournament(State(state.clone()), AuthUser(host.id), Path(event.id))
        .await
        .unwrap()
        .0;
    // Everyone gets a "tournament started" notification.
    let a2_notifications = list_notifications(State(state.clone()), AuthUser(a2.id))
        .await
        .unwrap()
        .0;
    assert!(a2_notifications.iter().any(|n| n.kind == "tournament_started"));

    let only_match = &bracket.matches[0];
    let _ = set_match_winner(
        State(state.clone()),
        AuthUser(host.id),
        Path((event.id, only_match.id)),
        Json(SetMatchWinner { winner_entry_id: team_a.id }),
    )
    .await
    .unwrap();

    let a1_final = list_notifications(State(state.clone()), AuthUser(a1.id))
        .await
        .unwrap()
        .0;
    assert!(a1_final.iter().any(|n| n.kind == "match_won"));
    let b1_final = list_notifications(State(state.clone()), AuthUser(b1.id))
        .await
        .unwrap()
        .0;
    assert!(b1_final.iter().any(|n| n.kind == "match_lost"));
}

#[sqlx::test]
async fn deleting_an_event_cleans_up_participants_teams_matches_and_notifications(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
    let host = register_user(&state, "delhost@test.de", "password123", "Host").await;
    let p1 = register_user(&state, "del1@test.de", "password123", "P1").await;
    let p2 = register_user(&state, "del2@test.de", "password123", "P2").await;

    let event = create_event(
        State(state.clone()),
        AuthUser(host.id),
        Json(new_event_req("Doomed Cup", 1, None, "knockout", false)),
    )
    .await
    .unwrap()
    .0;
    for p in [&p1, &p2] {
        join_event(State(state.clone()), AuthUser(p.id), Path(event.id), Json(JoinWithCode::default()))
            .await
            .unwrap();
    }
    // Generates event_matches rows and, via set_match_winner, a notification
    // referencing this event — both have FK columns pointing at `events`.
    let bracket = start_event_tournament(State(state.clone()), AuthUser(host.id), Path(event.id))
        .await
        .unwrap()
        .0;
    let _ = set_match_winner(
        State(state.clone()),
        AuthUser(host.id),
        Path((event.id, bracket.matches[0].id)),
        Json(SetMatchWinner { winner_entry_id: p1.id }),
    )
    .await
    .unwrap();

    // Must not fail with a foreign key constraint error.
    delete_event(State(state.clone()), AuthUser(host.id), Path(event.id))
        .await
        .expect("deleting an event with participants/matches/notifications should succeed");

    let after = get_event(State(state.clone()), HeaderMap::new(), Path(event.id)).await;
    assert_eq!(after.unwrap_err().0, StatusCode::NOT_FOUND);

    // The notification survives with its event reference detached, rather
    // than being silently dropped or blocking the delete.
    let p1_notifications = list_notifications(State(state.clone()), AuthUser(p1.id))
        .await
        .unwrap()
        .0;
    assert!(p1_notifications.iter().any(|n| n.kind == "match_won" && n.event_id.is_none()));
}

// ---- events: tournaments, teams, brackets ----

/// All `NewGameEvent` fields a test doesn't care about get sane zero/None
/// defaults — only the knobs relevant to bracket/team/privacy behavior are
/// parameterized, so each test body stays focused on what it's checking.
fn new_event_req(
    title: &str,
    team_size: i64,
    max_entries: Option<i64>,
    format: &str,
    is_private: bool,
) -> NewGameEvent {
    NewGameEvent {
        title: title.to_string(),
        description: None,
        catalog_game_id: None,
        custom_game_title: None,
        registration_deadline: None,
        starts_at: None,
        ends_at: None,
        prize_cents: 0,
        prize_mode: "winner_takes_all".to_string(),
        prize_second_cents: 0,
        prize_third_cents: 0,
        team_size,
        max_entries,
        format: format.to_string(),
        is_private,
    }
}

#[sqlx::test]
async fn knockout_bracket_handles_byes_and_propagates_winners_to_the_final(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
    let host = register_user(&state, "host@test.de", "password123", "Host").await;
    let p1 = register_user(&state, "p1@test.de", "password123", "P1").await;
    let p2 = register_user(&state, "p2@test.de", "password123", "P2").await;
    let p3 = register_user(&state, "p3@test.de", "password123", "P3").await;

    let event = create_event(
        State(state.clone()),
        AuthUser(host.id),
        Json(new_event_req("3-Way Cup", 1, None, "knockout", false)),
    )
    .await
    .unwrap()
    .0;

    for p in [&p1, &p2, &p3] {
        join_event(
            State(state.clone()),
            AuthUser(p.id),
            Path(event.id),
            Json(JoinWithCode::default()),
        )
        .await
        .unwrap();
    }

    let bracket = start_event_tournament(State(state.clone()), AuthUser(host.id), Path(event.id))
        .await
        .unwrap()
        .0;

    // 3 entries -> bracket of 4 -> round 1 has 2 matches, round 2 is the final.
    assert_eq!(bracket.entries.len(), 3);
    assert_eq!(bracket.matches.len(), 3);
    let round1: Vec<_> = bracket.matches.iter().filter(|m| m.round == 1).collect();
    let round2: Vec<_> = bracket.matches.iter().filter(|m| m.round == 2).collect();
    assert_eq!(round1.len(), 2);
    assert_eq!(round2.len(), 1);

    // Exactly one round-1 match got a bye (only one entry, auto-resolved winner).
    let bye_match = round1.iter().find(|m| m.winner_entry_id.is_some()).unwrap();
    let real_match = round1.iter().find(|m| m.winner_entry_id.is_none()).unwrap();
    assert!(real_match.entry_a_id.is_some() && real_match.entry_b_id.is_some());

    // The bye's winner should already be sitting in the final.
    let final_match = round2[0];
    assert!(
        final_match.entry_a_id == bye_match.winner_entry_id
            || final_match.entry_b_id == bye_match.winner_entry_id
    );

    // Resolve the real round-1 match and confirm the winner advances.
    let winner_id = real_match.entry_a_id.unwrap();
    let bracket = set_match_winner(
        State(state.clone()),
        AuthUser(host.id),
        Path((event.id, real_match.id)),
        Json(SetMatchWinner { winner_entry_id: winner_id }),
    )
    .await
    .unwrap()
    .0;
    let final_match = bracket.matches.iter().find(|m| m.round == 2).unwrap();
    assert!(final_match.entry_a_id == Some(winner_id) || final_match.entry_b_id == Some(winner_id));
    assert!(final_match.entry_a_id.is_some() && final_match.entry_b_id.is_some());

    // Crown a champion.
    let champion = bracket
        .matches
        .iter()
        .find(|m| m.round == 1 && m.winner_entry_id.is_some())
        .unwrap()
        .winner_entry_id
        .unwrap();
    let bracket = set_match_winner(
        State(state.clone()),
        AuthUser(host.id),
        Path((event.id, final_match.id)),
        Json(SetMatchWinner { winner_entry_id: champion }),
    )
    .await
    .unwrap()
    .0;
    assert_eq!(
        bracket.matches.iter().find(|m| m.round == 2).unwrap().winner_entry_id,
        Some(champion)
    );
}

#[sqlx::test]
async fn tournament_prize_money_is_recorded_as_payouts_on_completion(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
    let host = register_user(&state, "phost@test.de", "password123", "Host").await;
    let p1 = register_user(&state, "pp1@test.de", "password123", "P1").await;
    let p2 = register_user(&state, "pp2@test.de", "password123", "P2").await;

    let event = create_event(
        State(state.clone()),
        AuthUser(host.id),
        Json(NewGameEvent {
            title: "Cash Cup".to_string(),
            description: None,
            catalog_game_id: None,
            custom_game_title: None,
            registration_deadline: None,
            starts_at: None,
            ends_at: None,
            prize_cents: 1000,
            prize_mode: "split".to_string(),
            prize_second_cents: 300,
            prize_third_cents: 0,
            team_size: 1,
            max_entries: None,
            format: "knockout".to_string(),
            is_private: false,
        }),
    )
    .await
    .unwrap()
    .0;

    for p in [&p1, &p2] {
        join_event(
            State(state.clone()),
            AuthUser(p.id),
            Path(event.id),
            Json(JoinWithCode::default()),
        )
        .await
        .unwrap();
    }

    let bracket = start_event_tournament(State(state.clone()), AuthUser(host.id), Path(event.id))
        .await
        .unwrap()
        .0;
    let final_match = bracket.matches.iter().find(|m| m.round == 1).unwrap();
    let winner_id = final_match.entry_a_id.unwrap();
    let loser_id = final_match.entry_b_id.unwrap();

    let _ = set_match_winner(
        State(state.clone()),
        AuthUser(host.id),
        Path((event.id, final_match.id)),
        Json(SetMatchWinner { winner_entry_id: winner_id }),
    )
    .await
    .unwrap();

    let winner_payouts = list_my_tournament_payouts(State(state.clone()), AuthUser(winner_id))
        .await
        .unwrap()
        .0;
    assert_eq!(winner_payouts.len(), 1);
    assert_eq!(winner_payouts[0].placement, 1);
    assert_eq!(winner_payouts[0].amount_cents, 1000);

    let loser_payouts = list_my_tournament_payouts(State(state.clone()), AuthUser(loser_id))
        .await
        .unwrap()
        .0;
    assert_eq!(loser_payouts.len(), 1);
    assert_eq!(loser_payouts[0].placement, 2);
    assert_eq!(loser_payouts[0].amount_cents, 300);
}

#[sqlx::test]
async fn team_event_blocks_direct_join_and_requires_full_teams_to_start(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
    let host = register_user(&state, "thost@test.de", "password123", "Host").await;
    let a1 = register_user(&state, "a1@test.de", "password123", "A1").await;
    let a2 = register_user(&state, "a2@test.de", "password123", "A2").await;
    let b1 = register_user(&state, "b1@test.de", "password123", "B1").await;

    let event = create_event(
        State(state.clone()),
        AuthUser(host.id),
        Json(new_event_req("Duo Cup", 2, None, "knockout", false)),
    )
    .await
    .unwrap()
    .0;

    // Solo join must be rejected — this event is team-only.
    let direct_join = join_event(
        State(state.clone()),
        AuthUser(a1.id),
        Path(event.id),
        Json(JoinWithCode::default()),
    )
    .await;
    assert_eq!(direct_join.unwrap_err().0, StatusCode::BAD_REQUEST);

    let team_a = create_event_team(
        State(state.clone()),
        AuthUser(a1.id),
        Path(event.id),
        Json(NewEventTeam { name: "Team A".to_string(), code: None }),
    )
    .await
    .unwrap()
    .0;
    let _ = join_event_team(
        State(state.clone()),
        AuthUser(a2.id),
        Path((event.id, team_a.id)),
        Json(JoinWithCode::default()),
    )
    .await
    .unwrap();

    // Team B is created but left incomplete (1/2 members).
    let _ = create_event_team(
        State(state.clone()),
        AuthUser(b1.id),
        Path(event.id),
        Json(NewEventTeam { name: "Team B".to_string(), code: None }),
    )
    .await
    .unwrap();

    let blocked_start =
        start_event_tournament(State(state.clone()), AuthUser(host.id), Path(event.id)).await;
    assert_eq!(blocked_start.unwrap_err().0, StatusCode::BAD_REQUEST);

    // A team that's already full can't be joined again.
    let c1 = register_user(&state, "c1@test.de", "password123", "C1").await;
    let overfull = join_event_team(
        State(state.clone()),
        AuthUser(c1.id),
        Path((event.id, team_a.id)),
        Json(JoinWithCode::default()),
    )
    .await;
    assert_eq!(overfull.unwrap_err().0, StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn max_entries_caps_join_event(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
    let host = register_user(&state, "caphost@test.de", "password123", "Host").await;
    let p1 = register_user(&state, "cap1@test.de", "password123", "P1").await;
    let p2 = register_user(&state, "cap2@test.de", "password123", "P2").await;

    let event = create_event(
        State(state.clone()),
        AuthUser(host.id),
        Json(new_event_req("Small Cup", 1, Some(1), "all", false)),
    )
    .await
    .unwrap()
    .0;

    join_event(State(state.clone()), AuthUser(p1.id), Path(event.id), Json(JoinWithCode::default()))
        .await
        .unwrap();
    let result = join_event(
        State(state.clone()),
        AuthUser(p2.id),
        Path(event.id),
        Json(JoinWithCode::default()),
    )
    .await;
    assert_eq!(result.unwrap_err().0, StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn private_event_requires_code_and_is_hidden_from_strangers(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
    let host = register_user(&state, "phost@test.de", "password123", "Host").await;
    let joiner = register_user(&state, "pjoiner@test.de", "password123", "Joiner").await;
    let stranger = register_user(&state, "pstranger@test.de", "password123", "Stranger").await;

    let created = create_event(
        State(state.clone()),
        AuthUser(host.id),
        Json(new_event_req("Invite Only", 1, None, "all", true)),
    )
    .await
    .unwrap()
    .0;
    let code = created.join_code.clone().expect("host should see the join code");

    // Wrong/missing code is rejected.
    let no_code = join_event(
        State(state.clone()),
        AuthUser(joiner.id),
        Path(created.id),
        Json(JoinWithCode::default()),
    )
    .await;
    assert_eq!(no_code.unwrap_err().0, StatusCode::FORBIDDEN);
    let wrong_code = join_event(
        State(state.clone()),
        AuthUser(joiner.id),
        Path(created.id),
        Json(JoinWithCode { code: Some("WRONG1".to_string()) }),
    )
    .await;
    assert_eq!(wrong_code.unwrap_err().0, StatusCode::FORBIDDEN);

    // Correct code (case-insensitive) works.
    join_event(
        State(state.clone()),
        AuthUser(joiner.id),
        Path(created.id),
        Json(JoinWithCode { code: Some(code.to_lowercase()) }),
    )
    .await
    .unwrap();

    // Hidden from a stranger's listing, but visible to the host and the joiner.
    let stranger_list = list_events(State(state.clone()), bearer_headers(&state, stranger.id))
        .await
        .unwrap()
        .0;
    assert!(stranger_list.iter().all(|e| e.id != created.id));
    let host_list = list_events(State(state.clone()), bearer_headers(&state, host.id))
        .await
        .unwrap()
        .0;
    assert!(host_list.iter().any(|e| e.id == created.id));
    let joiner_list = list_events(State(state.clone()), bearer_headers(&state, joiner.id))
        .await
        .unwrap()
        .0;
    assert!(joiner_list.iter().any(|e| e.id == created.id));

    // The join code itself is only ever handed back to the host.
    let as_joiner = get_event(State(state.clone()), bearer_headers(&state, joiner.id), Path(created.id))
        .await
        .unwrap()
        .0;
    assert_eq!(as_joiner.join_code, None);
    let as_host = get_event(State(state.clone()), bearer_headers(&state, host.id), Path(created.id))
        .await
        .unwrap()
        .0;
    assert_eq!(as_host.join_code, Some(code.clone()));

    // Findable by code even though it's excluded from the public list.
    let found = find_event_by_code(
        State(state.clone()),
        HeaderMap::new(),
        Json(JoinByCodeRequest { code }),
    )
    .await
    .unwrap()
    .0;
    assert_eq!(found.id, created.id);
}

#[sqlx::test]
async fn only_host_can_set_match_winner_and_winner_must_be_in_the_match(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
    let host = register_user(&state, "whost@test.de", "password123", "Host").await;
    let p1 = register_user(&state, "w1@test.de", "password123", "W1").await;
    let p2 = register_user(&state, "w2@test.de", "password123", "W2").await;

    let event = create_event(
        State(state.clone()),
        AuthUser(host.id),
        Json(new_event_req("Duel", 1, None, "knockout", false)),
    )
    .await
    .unwrap()
    .0;
    for p in [&p1, &p2] {
        join_event(State(state.clone()), AuthUser(p.id), Path(event.id), Json(JoinWithCode::default()))
            .await
            .unwrap();
    }
    let bracket = start_event_tournament(State(state.clone()), AuthUser(host.id), Path(event.id))
        .await
        .unwrap()
        .0;
    let only_match = &bracket.matches[0];

    // Non-host can't decide the match.
    let as_player = set_match_winner(
        State(state.clone()),
        AuthUser(p1.id),
        Path((event.id, only_match.id)),
        Json(SetMatchWinner { winner_entry_id: p1.id }),
    )
    .await;
    assert_eq!(as_player.unwrap_err().0, StatusCode::FORBIDDEN);

    // Host can't crown someone who isn't in the match.
    let stranger = register_user(&state, "w3@test.de", "password123", "W3").await;
    let bogus_winner = set_match_winner(
        State(state.clone()),
        AuthUser(host.id),
        Path((event.id, only_match.id)),
        Json(SetMatchWinner { winner_entry_id: stranger.id }),
    )
    .await;
    assert_eq!(bogus_winner.unwrap_err().0, StatusCode::BAD_REQUEST);
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

#[sqlx::test]
async fn admin_extractor_rejects_non_admin_and_accepts_admin(pool: sqlx::PgPool) {
    use axum::extract::FromRequestParts;

    let state = AppState::for_tests(pool).await;
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

// ---- GDPR ----

#[sqlx::test]
async fn delete_account_rejects_wrong_password_and_scrubs_pii_on_success(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
    let alice = register_user(&state, "alice@test.de", "correct-password", "Alice").await;

    let denied = delete_account(
        State(state.clone()),
        AuthUser(alice.id),
        Json(DeleteAccountRequest { password: "wrong-password".to_string() }),
    )
    .await;
    assert_eq!(denied.unwrap_err().0, StatusCode::UNAUTHORIZED);

    delete_account(
        State(state.clone()),
        AuthUser(alice.id),
        Json(DeleteAccountRequest { password: "correct-password".to_string() }),
    )
    .await
    .expect("deletion with the correct password should succeed");

    let scrubbed = me(State(state.clone()), AuthUser(alice.id)).await.unwrap().0;
    assert_eq!(scrubbed.display_name, "Gelöschter Nutzer");
    assert!(scrubbed.avatar_url.is_none());
    assert!(scrubbed.is_profile_hidden);

    let login_attempt = login(
        State(state.clone()),
        Json(LoginRequest {
            email: "alice@test.de".to_string(),
            password: "correct-password".to_string(),
        }),
    )
    .await;
    assert!(login_attempt.is_err(), "old credentials must no longer work");
}

#[sqlx::test]
async fn export_my_data_includes_orders_and_library(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
    let alice = register_user(&state, "alice@test.de", "password123", "Alice").await;
    let publisher = register_user(&state, "pub@test.de", "password123", "Pub").await;

    let game = create_game(
        State(state.clone()),
        AuthUser(publisher.id),
        Json(NewCatalogGame {
            title: "Pixel Knights".to_string(),
            description: None,
            cover_url: None,
            tags: None,
            min_specs: None,
            recommended_specs: None,
            save_path_hint: None,
        }),
    )
    .await
    .unwrap()
    .0;

    let _ = purchase_game(State(state.clone()), AuthUser(alice.id), Path(game.id))
        .await
        .unwrap();

    let export = export_my_data(State(state.clone()), AuthUser(alice.id))
        .await
        .unwrap()
        .0;

    assert_eq!(export["orders"].as_array().unwrap().len(), 1);
    assert_eq!(export["library"].as_array().unwrap().len(), 1);
    assert_eq!(export["profile"]["display_name"], "Alice");
}

#[sqlx::test]
async fn sales_milestones_notify_the_publisher(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool).await;
    let alice = register_user(&state, "alice@test.de", "password123", "Alice").await;
    let publisher = register_user(&state, "pub@test.de", "password123", "Pub").await;

    let game = create_game(
        State(state.clone()),
        AuthUser(publisher.id),
        Json(NewCatalogGame {
            title: "Pixel Knights".to_string(),
            description: None,
            cover_url: None,
            tags: None,
            min_specs: None,
            recommended_specs: None,
            save_path_hint: None,
        }),
    )
    .await
    .unwrap()
    .0;

    let _ = purchase_game(State(state.clone()), AuthUser(alice.id), Path(game.id))
        .await
        .unwrap();

    let notifications = list_notifications(State(state.clone()), AuthUser(publisher.id))
        .await
        .unwrap()
        .0;
    assert_eq!(notifications.len(), 1, "first sale should notify the publisher");
    assert_eq!(notifications[0].kind, "sales_milestone");
    assert!(notifications[0].message.contains("zum ersten Mal"));

    // Sales 2 through 9 are not round numbers and shouldn't add another notification.
    for _ in 2..10 {
        let _ = purchase_game(State(state.clone()), AuthUser(alice.id), Path(game.id))
            .await
            .unwrap();
    }
    let notifications = list_notifications(State(state.clone()), AuthUser(publisher.id))
        .await
        .unwrap()
        .0;
    assert_eq!(notifications.len(), 1, "no milestone between the 2nd and 9th sale");

    // The 10th sale crosses the next milestone.
    let _ = purchase_game(State(state.clone()), AuthUser(alice.id), Path(game.id))
        .await
        .unwrap();
    let notifications = list_notifications(State(state.clone()), AuthUser(publisher.id))
        .await
        .unwrap()
        .0;
    assert_eq!(notifications.len(), 2);
    assert!(notifications[0].message.contains("10 Verkäufe"));
}
