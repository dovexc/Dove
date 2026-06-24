use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::extract::{ConnectInfo, State};
use axum::http::{Request, StatusCode};
use axum::middleware::Next;
use axum::response::Response;

use crate::state::AppState;

/// Simple in-memory sliding-window rate limiter, keyed by an arbitrary
/// string (here: client IP). Good enough for a single-process server; would
/// need a shared store (e.g. Redis) behind a load balancer with multiple
/// instances.
pub struct RateLimiter {
    max_requests: usize,
    window: Duration,
    hits: Mutex<HashMap<String, Vec<Instant>>>,
}

impl RateLimiter {
    pub fn new(max_requests: usize, window: Duration) -> Self {
        Self {
            max_requests,
            window,
            hits: Mutex::new(HashMap::new()),
        }
    }

    pub(crate) fn check(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut hits = self.hits.lock().unwrap();
        let entry = hits.entry(key.to_string()).or_default();
        entry.retain(|t| now.duration_since(*t) < self.window);
        if entry.len() >= self.max_requests {
            false
        } else {
            entry.push(now);
            true
        }
    }
}

/// Middleware for `/api/auth/*`: throttles login/register attempts per
/// client IP to slow down brute-force and registration spam.
pub async fn limit_auth_attempts(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request<Body>,
    next: Next,
) -> Result<Response, (StatusCode, String)> {
    let key = addr.ip().to_string();
    if state.auth_rate_limiter.check(&key) {
        Ok(next.run(request).await)
    } else {
        Err((
            StatusCode::TOO_MANY_REQUESTS,
            "Zu viele Versuche. Bitte warte kurz, bevor du es erneut versuchst.".to_string(),
        ))
    }
}
