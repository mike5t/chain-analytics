CREATE TABLE IF NOT EXISTS wallets (
    address     TEXT PRIMARY KEY,
    label       TEXT,
    flagged     BOOLEAN DEFAULT FALSE,
    notes       TEXT,
    added_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS native_balances (
    wallet      TEXT,
    chain       TEXT,
    balance     DOUBLE,
    updated_at  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (wallet, chain)
);

CREATE TABLE IF NOT EXISTS token_balances (
    wallet      TEXT,
    chain       TEXT,
    token       TEXT,
    amount      DOUBLE,
    updated_at  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (wallet, chain, token)
);

CREATE TABLE IF NOT EXISTS address_flows (
    tx_hash         TEXT,
    chain           TEXT,
    from_address    TEXT,
    to_address      TEXT,
    token           TEXT,
    token_address   TEXT,
    amount          DOUBLE,
    block_number    BIGINT,
    block_time      TIMESTAMP,
    PRIMARY KEY (tx_hash, chain, token_address)
);

CREATE TABLE IF NOT EXISTS burns (
    tx_hash         TEXT,
    chain           TEXT,
    token           TEXT,
    token_address   TEXT,
    from_address    TEXT,
    amount          DOUBLE,
    block_number    BIGINT,
    block_time      TIMESTAMP,
    PRIMARY KEY (tx_hash, chain)
);

CREATE TABLE IF NOT EXISTS address_labels (
    address     TEXT,
    chain       TEXT,
    label       TEXT,
    category    TEXT,
    PRIMARY KEY (address, chain)
);

CREATE TABLE IF NOT EXISTS hop_graph (
    source          TEXT,
    destination     TEXT,
    chain           TEXT,
    hop_number      INT,
    total_amount    DOUBLE,
    token           TEXT,
    tx_count        INT,
    PRIMARY KEY (source, destination, chain, token)
);

CREATE TABLE IF NOT EXISTS clusters (
    cluster_id      TEXT,
    address         TEXT,
    chain           TEXT,
    reason          TEXT,
    PRIMARY KEY (cluster_id, address)
);

CREATE TABLE IF NOT EXISTS risk_scores (
    address         TEXT PRIMARY KEY,
    score           INT,
    flags           TEXT,
    scored_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sanctions (
    address         TEXT PRIMARY KEY,
    name            TEXT,
    program         TEXT,
    added_date      TEXT
);

CREATE TABLE IF NOT EXISTS defi_swaps (
    tx_hash         TEXT,
    chain           TEXT,
    wallet          TEXT,
    protocol        TEXT,
    token_in        TEXT,
    token_out       TEXT,
    amount_in       DOUBLE,
    amount_out      DOUBLE,
    block_time      TIMESTAMP,
    PRIMARY KEY (tx_hash, chain)
);

CREATE TABLE IF NOT EXISTS defi_lending (
    tx_hash         TEXT,
    chain           TEXT,
    wallet          TEXT,
    protocol        TEXT,
    action          TEXT,
    token           TEXT,
    amount          DOUBLE,
    block_time      TIMESTAMP,
    PRIMARY KEY (tx_hash, chain)
);

CREATE TABLE IF NOT EXISTS alert_rules (
    id              INTEGER PRIMARY KEY,
    wallet          TEXT,
    chain           TEXT,
    alert_type      TEXT,
    threshold       DOUBLE,
    active          BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS alerts_fired (
    id              INTEGER PRIMARY KEY,
    rule_id         INTEGER,
    wallet          TEXT,
    tx_hash         TEXT,
    message         TEXT,
    fired_at        TIMESTAMP DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS alert_rules_seq START 1;
CREATE SEQUENCE IF NOT EXISTS alerts_fired_seq START 1;

CREATE TABLE IF NOT EXISTS alchemy_transfers (
    tx_hash         TEXT,
    chain           TEXT,
    from_address    TEXT,
    to_address      TEXT,
    asset           TEXT,
    value           DOUBLE,
    category        TEXT,
    block_num       BIGINT,
    block_time      TIMESTAMP,
    PRIMARY KEY (tx_hash, chain)
);
