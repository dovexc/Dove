use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client;

use crate::handlers::ApiError;

/// Thin wrapper around an S3 client pointed at a Cloudflare R2 bucket. R2 is
/// S3-API-compatible, so the official AWS SDK works against it unmodified —
/// just a custom `endpoint_url` and the `"auto"` region R2 expects instead of
/// a real AWS region.
pub struct Storage {
    client: Client,
    bucket: String,
    public_base_url: String,
}

impl Storage {
    /// Falls back to obviously-non-functional placeholders when R2 env vars
    /// are missing, rather than panicking at startup — handler tests that
    /// never touch storage (the large majority) shouldn't need real R2
    /// credentials just to construct an `AppState`. Anything that actually
    /// calls `put`/`get`/`delete` without real credentials configured will
    /// fail at that call site instead, same as any other misconfiguration.
    pub async fn init() -> Storage {
        let _ = dotenvy::dotenv();
        let account_id = std::env::var("DOVE_R2_ACCOUNT_ID").unwrap_or_else(|_| "unset".to_string());
        let access_key_id =
            std::env::var("DOVE_R2_ACCESS_KEY_ID").unwrap_or_else(|_| "unset".to_string());
        let secret_access_key =
            std::env::var("DOVE_R2_SECRET_ACCESS_KEY").unwrap_or_else(|_| "unset".to_string());
        let bucket = std::env::var("DOVE_R2_BUCKET").unwrap_or_else(|_| "unset".to_string());
        let public_base_url = std::env::var("DOVE_R2_PUBLIC_BASE_URL")
            .unwrap_or_else(|_| "https://unset.invalid".to_string())
            .trim_end_matches('/')
            .to_string();

        let credentials = aws_credential_types::Credentials::new(
            access_key_id,
            secret_access_key,
            None,
            None,
            "dove-r2",
        );
        let config = aws_config::SdkConfig::builder()
            .endpoint_url(format!("https://{account_id}.r2.cloudflarestorage.com"))
            .region(aws_config::Region::new("auto"))
            .credentials_provider(aws_credential_types::provider::SharedCredentialsProvider::new(
                credentials,
            ))
            .behavior_version(aws_config::BehaviorVersion::latest())
            .build();

        // R2's S3-compatible API expects path-style addressing
        // (endpoint/bucket/key), not AWS S3's virtual-hosted-style
        // (bucket.endpoint/key) — this is Cloudflare's documented
        // requirement for the AWS SDK.
        let s3_config = aws_sdk_s3::config::Builder::from(&config)
            .force_path_style(true)
            .build();

        Storage {
            client: Client::from_conf(s3_config),
            bucket,
            public_base_url,
        }
    }

    fn internal_error<E: std::fmt::Debug>(e: E) -> ApiError {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Speicher-Fehler: {e:?}"),
        )
    }

    pub async fn put(&self, key: &str, bytes: Vec<u8>, content_type: &str) -> Result<String, ApiError> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(ByteStream::from(bytes))
            .content_type(content_type)
            .send()
            .await
            .map_err(Self::internal_error)?;
        Ok(self.public_url(key))
    }

    pub async fn get(&self, key: &str) -> Result<Vec<u8>, ApiError> {
        let object = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(Self::internal_error)?;
        let bytes = object.body.collect().await.map_err(Self::internal_error)?;
        Ok(bytes.into_bytes().to_vec())
    }

    /// Best-effort — a failed delete (e.g. the key never existed) shouldn't
    /// block whatever replace/cleanup flow triggered it.
    pub async fn delete(&self, key: &str) {
        let _ = self.client.delete_object().bucket(&self.bucket).key(key).send().await;
    }

    pub fn public_url(&self, key: &str) -> String {
        format!("{}/{key}", self.public_base_url)
    }

    /// Strips the public base URL off a stored URL to recover the R2 object
    /// key, for delete operations on URLs read back from the DB.
    pub fn key_from_url<'a>(&self, url: &'a str) -> Option<&'a str> {
        url.strip_prefix(&self.public_base_url)
            .map(|rest| rest.trim_start_matches('/'))
    }
}
