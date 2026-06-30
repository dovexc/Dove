CREATE TABLE user_report_images (
    id BIGSERIAL PRIMARY KEY,
    report_id BIGINT NOT NULL REFERENCES user_reports(id),
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_report_images_report_idx ON user_report_images(report_id);
