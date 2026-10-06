CREATE TABLE IF NOT EXISTS sensor_readings (
    id BIGSERIAL PRIMARY KEY,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    gas DOUBLE PRECISION,
    presence BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    source VARCHAR(20) NOT NULL,
    type VARCHAR(30) NOT NULL,
    severity VARCHAR(10) NOT NULL,
    dev VARCHAR(32) NOT NULL,
    message VARCHAR(200) NOT NULL,
    confidence DOUBLE PRECISION,
    data JSONB
);