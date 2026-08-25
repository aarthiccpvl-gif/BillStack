-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT true,
    `is_read_only` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(80) NOT NULL,
    `module` VARCHAR(40) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `permissions_key_key`(`key`),
    INDEX `permissions_module_idx`(`module`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` INTEGER NOT NULL,
    `permission_id` INTEGER NOT NULL,

    INDEX `role_permissions_permission_id_idx`(`permission_id`),
    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `email` VARCHAR(190) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role_id` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'LOCKED') NOT NULL DEFAULT 'ACTIVE',
    `phone` VARCHAR(30) NULL,
    `must_change_password` BOOLEAN NOT NULL DEFAULT false,
    `token_version` INTEGER NOT NULL DEFAULT 0,
    `last_login_at` DATETIME(3) NULL,
    `failed_login_count` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_role_id_idx`(`role_id`),
    INDEX `users_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `replaced_by_id` BIGINT NULL,
    `ip` VARCHAR(64) NULL,
    `user_agent` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_user_id_expires_at_idx`(`user_id`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_settings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `company_name` VARCHAR(200) NOT NULL,
    `legal_name` VARCHAR(200) NULL,
    `address_line1` VARCHAR(255) NULL,
    `address_line2` VARCHAR(255) NULL,
    `city` VARCHAR(100) NULL,
    `state` VARCHAR(100) NULL,
    `state_code` VARCHAR(4) NULL,
    `country` VARCHAR(100) NULL,
    `postal_code` VARCHAR(20) NULL,
    `phone` VARCHAR(40) NULL,
    `email` VARCHAR(190) NULL,
    `website` VARCHAR(190) NULL,
    `gstin` VARCHAR(20) NULL,
    `pan` VARCHAR(20) NULL,
    `cin` VARCHAR(30) NULL,
    `other_registrations` JSON NULL,
    `logo_file_id` BIGINT NULL,
    `favicon_file_id` BIGINT NULL,
    `signature_file_id` BIGINT NULL,
    `seal_file_id` BIGINT NULL,
    `signature_label` VARCHAR(120) NULL,
    `primary_color` VARCHAR(9) NOT NULL DEFAULT '#0f5477',
    `secondary_color` VARCHAR(9) NOT NULL DEFAULT '#5e6f7c',
    `default_font` VARCHAR(60) NOT NULL DEFAULT 'Inter',
    `base_currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
    `financial_year_start_month` INTEGER NOT NULL DEFAULT 4,
    `default_invoice_template_id` INTEGER NULL,
    `default_quotation_template_id` INTEGER NULL,
    `default_terms_invoice` TEXT NULL,
    `default_terms_quotation` TEXT NULL,
    `default_notes` TEXT NULL,
    `is_configured` BOOLEAN NOT NULL DEFAULT false,
    `updated_by` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_bank_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL DEFAULT 1,
    `bank_name` VARCHAR(150) NOT NULL,
    `account_name` VARCHAR(150) NOT NULL,
    `account_number` VARCHAR(60) NOT NULL,
    `ifsc` VARCHAR(20) NULL,
    `swift` VARCHAR(20) NULL,
    `branch` VARCHAR(150) NULL,
    `currency_code` CHAR(3) NULL,
    `payment_instructions` TEXT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `company_bank_accounts_company_id_status_idx`(`company_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_settings` (
    `key` VARCHAR(80) NOT NULL,
    `value_json` JSON NOT NULL,
    `description` VARCHAR(255) NULL,
    `updated_by` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `financial_years` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(9) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `is_current` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `financial_years_code_key`(`code`),
    INDEX `financial_years_start_date_end_date_idx`(`start_date`, `end_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `numbering_series` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `doc_type` ENUM('QUOTATION', 'INVOICE', 'CREDIT_NOTE') NOT NULL,
    `prefix` VARCHAR(20) NOT NULL,
    `pattern` VARCHAR(80) NOT NULL,
    `padding` INTEGER NOT NULL DEFAULT 3,
    `start_number` INTEGER NOT NULL DEFAULT 1,
    `reset_policy` ENUM('FINANCIAL_YEAR', 'NEVER') NOT NULL DEFAULT 'FINANCIAL_YEAR',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `numbering_series_doc_type_is_active_idx`(`doc_type`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_sequences` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `numbering_series_id` INTEGER NOT NULL,
    `financial_year_id` INTEGER NULL,
    `last_number` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `document_sequences_financial_year_id_idx`(`financial_year_id`),
    UNIQUE INDEX `document_sequences_numbering_series_id_financial_year_id_key`(`numbering_series_id`, `financial_year_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `currencies` (
    `code` CHAR(3) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `symbol` VARCHAR(8) NOT NULL,
    `decimal_places` INTEGER NOT NULL DEFAULT 2,
    `symbol_position` ENUM('PREFIX', 'SUFFIX') NOT NULL DEFAULT 'PREFIX',
    `separator_style` ENUM('WESTERN', 'INDIAN') NOT NULL DEFAULT 'WESTERN',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exchange_rates` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `from_currency` CHAR(3) NOT NULL,
    `to_currency` CHAR(3) NOT NULL,
    `rate` DECIMAL(18, 8) NOT NULL,
    `effective_date` DATE NOT NULL,
    `source` VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `exchange_rates_from_currency_to_currency_effective_date_key`(`from_currency`, `to_currency`, `effective_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tax_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(20) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `scope` ENUM('INTRA_STATE', 'INTER_STATE', 'UNION_TERRITORY', 'NONE') NOT NULL DEFAULT 'NONE',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `tax_types_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tax_rates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tax_type_id` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `rate` DECIMAL(9, 4) NOT NULL,
    `effective_from` DATE NULL,
    `effective_to` DATE NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `tax_rates_tax_type_id_is_active_idx`(`tax_type_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tax_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(80) NOT NULL,
    `scope` ENUM('INTRA_STATE', 'INTER_STATE', 'UNION_TERRITORY', 'NONE') NOT NULL DEFAULT 'NONE',
    `total_rate` DECIMAL(9, 4) NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `tax_groups_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tax_group_rates` (
    `tax_group_id` INTEGER NOT NULL,
    `tax_rate_id` INTEGER NOT NULL,

    INDEX `tax_group_rates_tax_rate_id_idx`(`tax_rate_id`),
    PRIMARY KEY (`tax_group_id`, `tax_rate_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `units` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `units_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `parent_id` INTEGER NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',

    UNIQUE INDEX `item_categories_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `company_name` VARCHAR(200) NULL,
    `contact_person` VARCHAR(150) NULL,
    `email` VARCHAR(190) NULL,
    `phone` VARCHAR(40) NULL,
    `alt_phone` VARCHAR(40) NULL,
    `gstin` VARCHAR(20) NULL,
    `pan` VARCHAR(20) NULL,
    `other_tax_id` VARCHAR(40) NULL,
    `tax_treatment` ENUM('REGISTERED', 'UNREGISTERED', 'COMPOSITION', 'OVERSEAS', 'SEZ') NOT NULL DEFAULT 'REGISTERED',
    `place_of_supply_state_code` VARCHAR(4) NULL,
    `default_currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
    `payment_terms_days` INTEGER NOT NULL DEFAULT 30,
    `notes` TEXT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customers_customer_code_key`(`customer_code`),
    INDEX `customers_name_idx`(`name`),
    INDEX `customers_status_idx`(`status`),
    INDEX `customers_default_currency_code_idx`(`default_currency_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `type` ENUM('BILLING', 'SHIPPING', 'OTHER') NOT NULL,
    `label` VARCHAR(60) NULL,
    `line1` VARCHAR(255) NULL,
    `line2` VARCHAR(255) NULL,
    `city` VARCHAR(100) NULL,
    `state` VARCHAR(100) NULL,
    `state_code` VARCHAR(4) NULL,
    `country` VARCHAR(100) NULL,
    `postal_code` VARCHAR(20) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,

    INDEX `customer_addresses_customer_id_type_idx`(`customer_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_contacts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `designation` VARCHAR(100) NULL,
    `email` VARCHAR(190) NULL,
    `phone` VARCHAR(40) NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,

    INDEX `customer_contacts_customer_id_idx`(`customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `item_code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `type` ENUM('PRODUCT', 'SERVICE') NOT NULL DEFAULT 'SERVICE',
    `unit_id` INTEGER NULL,
    `default_rate` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
    `default_tax_rate_id` INTEGER NULL,
    `default_tax_group_id` INTEGER NULL,
    `hsn_sac_code` VARCHAR(20) NULL,
    `category_id` INTEGER NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `items_item_code_key`(`item_code`),
    INDEX `items_name_idx`(`name`),
    INDEX `items_status_idx`(`status`),
    INDEX `items_category_id_idx`(`category_id`),
    INDEX `items_unit_id_idx`(`unit_id`),
    INDEX `items_currency_code_idx`(`currency_code`),
    INDEX `items_default_tax_rate_id_idx`(`default_tax_rate_id`),
    INDEX `items_default_tax_group_id_idx`(`default_tax_group_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(40) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `doc_type` ENUM('QUOTATION', 'INVOICE', 'CREDIT_NOTE') NOT NULL,
    `engine_key` VARCHAR(40) NOT NULL,
    `description` VARCHAR(255) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `templates_doc_type_status_idx`(`doc_type`, `status`),
    UNIQUE INDEX `templates_key_doc_type_key`(`key`, `doc_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `template_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `template_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `config_json` JSON NOT NULL,
    `change_note` VARCHAR(255) NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `published_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `template_versions_template_id_version_key`(`template_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quotations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `number` VARCHAR(60) NOT NULL,
    `financial_year_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `customer_snapshot` JSON NOT NULL,
    `billing_address_snapshot` JSON NULL,
    `shipping_address_snapshot` JSON NULL,
    `company_snapshot` JSON NOT NULL,
    `place_of_supply_state_code` VARCHAR(4) NULL,
    `currency_code` CHAR(3) NOT NULL,
    `currency_symbol` VARCHAR(8) NOT NULL,
    `currency_decimal_places` INTEGER NOT NULL DEFAULT 2,
    `exchange_rate_to_base` DECIMAL(18, 8) NOT NULL DEFAULT 1,
    `base_currency_code` CHAR(3) NOT NULL,
    `base_total` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `document_date` DATE NOT NULL,
    `expiry_date` DATE NULL,
    `reference_number` VARCHAR(80) NULL,
    `subject` VARCHAR(255) NULL,
    `status` ENUM('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CONVERTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `discount_mode` ENUM('NONE', 'PERCENT', 'AMOUNT') NOT NULL DEFAULT 'NONE',
    `discount_value` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `subtotal` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `discount_total` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxable_total` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `tax_total` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `adjustment` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `round_off` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `grand_total` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `tax_summary_json` JSON NOT NULL,
    `notes` TEXT NULL,
    `terms` TEXT NULL,
    `customer_message` TEXT NULL,
    `payment_instructions` TEXT NULL,
    `bank_account_id` INTEGER NULL,
    `show_bank_details` BOOLEAN NOT NULL DEFAULT true,
    `template_id` INTEGER NOT NULL,
    `template_version_id` INTEGER NOT NULL,
    `current_version` INTEGER NOT NULL DEFAULT 1,
    `custom_fields_json` JSON NULL,
    `converted_invoice_id` BIGINT NULL,
    `sent_at` DATETIME(3) NULL,
    `first_viewed_at` DATETIME(3) NULL,
    `accepted_at` DATETIME(3) NULL,
    `declined_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancel_reason` VARCHAR(255) NULL,
    `archived_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NOT NULL,
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `quotations_number_key`(`number`),
    UNIQUE INDEX `quotations_converted_invoice_id_key`(`converted_invoice_id`),
    INDEX `quotations_customer_id_document_date_idx`(`customer_id`, `document_date`),
    INDEX `quotations_status_document_date_idx`(`status`, `document_date`),
    INDEX `quotations_financial_year_id_status_idx`(`financial_year_id`, `status`),
    INDEX `quotations_document_date_idx`(`document_date`),
    INDEX `quotations_template_version_id_idx`(`template_version_id`),
    INDEX `quotations_currency_code_idx`(`currency_code`),
    INDEX `quotations_created_by_idx`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quotation_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `quotation_id` BIGINT NOT NULL,
    `line_number` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `item_id` INTEGER NULL,
    `item_code` VARCHAR(40) NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `hsn_sac_code` VARCHAR(20) NULL,
    `unit_code` VARCHAR(20) NULL,
    `quantity` DECIMAL(18, 3) NOT NULL,
    `rate` DECIMAL(18, 4) NOT NULL,
    `discount_mode` ENUM('NONE', 'PERCENT', 'AMOUNT') NOT NULL DEFAULT 'NONE',
    `discount_value` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `discount_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `line_gross` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `line_net` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `allocated_doc_discount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxable_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `tax_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `line_total` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `tax_group_id` INTEGER NULL,
    `is_tax_exempt` BOOLEAN NOT NULL DEFAULT false,
    `exempt_reason` VARCHAR(120) NULL,

    INDEX `quotation_items_quotation_id_sort_order_idx`(`quotation_id`, `sort_order`),
    INDEX `quotation_items_item_id_idx`(`item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quotation_item_taxes` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `quotation_item_id` BIGINT NOT NULL,
    `tax_rate_id` INTEGER NOT NULL,
    `tax_type_key` VARCHAR(20) NOT NULL,
    `label` VARCHAR(60) NOT NULL,
    `rate_percent` DECIMAL(9, 4) NOT NULL,
    `taxable_amount` DECIMAL(18, 4) NOT NULL,
    `tax_amount` DECIMAL(18, 4) NOT NULL,

    INDEX `quotation_item_taxes_quotation_item_id_idx`(`quotation_item_id`),
    INDEX `quotation_item_taxes_tax_rate_id_idx`(`tax_rate_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quotation_revisions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `quotation_id` BIGINT NOT NULL,
    `version` INTEGER NOT NULL,
    `changed_by` INTEGER NOT NULL,
    `change_reason` VARCHAR(500) NULL,
    `previous_data_json` JSON NOT NULL,
    `new_data_json` JSON NOT NULL,
    `diff_summary_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `quotation_revisions_quotation_id_version_key`(`quotation_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `number` VARCHAR(60) NOT NULL,
    `financial_year_id` INTEGER NOT NULL,
    `quotation_id` BIGINT NULL,
    `customer_id` INTEGER NOT NULL,
    `customer_snapshot` JSON NOT NULL,
    `billing_address_snapshot` JSON NULL,
    `shipping_address_snapshot` JSON NULL,
    `company_snapshot` JSON NOT NULL,
    `place_of_supply_state_code` VARCHAR(4) NULL,
    `currency_code` CHAR(3) NOT NULL,
    `currency_symbol` VARCHAR(8) NOT NULL,
    `currency_decimal_places` INTEGER NOT NULL DEFAULT 2,
    `exchange_rate_to_base` DECIMAL(18, 8) NOT NULL DEFAULT 1,
    `base_currency_code` CHAR(3) NOT NULL,
    `base_total` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `document_date` DATE NOT NULL,
    `due_date` DATE NULL,
    `payment_terms_days` INTEGER NOT NULL DEFAULT 30,
    `reference_number` VARCHAR(80) NULL,
    `subject` VARCHAR(255) NULL,
    `status` ENUM('DRAFT', 'ISSUED', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'VOID') NOT NULL DEFAULT 'DRAFT',
    `discount_mode` ENUM('NONE', 'PERCENT', 'AMOUNT') NOT NULL DEFAULT 'NONE',
    `discount_value` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `subtotal` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `discount_total` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxable_total` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `tax_total` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `adjustment` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `round_off` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `grand_total` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `amount_paid` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `payment_reference` VARCHAR(120) NULL,
    `tax_summary_json` JSON NOT NULL,
    `notes` TEXT NULL,
    `terms` TEXT NULL,
    `customer_message` TEXT NULL,
    `payment_instructions` TEXT NULL,
    `bank_account_id` INTEGER NULL,
    `show_bank_details` BOOLEAN NOT NULL DEFAULT true,
    `template_id` INTEGER NOT NULL,
    `template_version_id` INTEGER NOT NULL,
    `current_version` INTEGER NOT NULL DEFAULT 1,
    `custom_fields_json` JSON NULL,
    `issued_at` DATETIME(3) NULL,
    `sent_at` DATETIME(3) NULL,
    `first_viewed_at` DATETIME(3) NULL,
    `paid_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `voided_at` DATETIME(3) NULL,
    `cancel_reason` VARCHAR(255) NULL,
    `archived_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_by` INTEGER NOT NULL,
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invoices_number_key`(`number`),
    INDEX `invoices_customer_id_document_date_idx`(`customer_id`, `document_date`),
    INDEX `invoices_status_due_date_idx`(`status`, `due_date`),
    INDEX `invoices_financial_year_id_status_idx`(`financial_year_id`, `status`),
    INDEX `invoices_document_date_idx`(`document_date`),
    INDEX `invoices_quotation_id_idx`(`quotation_id`),
    INDEX `invoices_template_version_id_idx`(`template_version_id`),
    INDEX `invoices_currency_code_idx`(`currency_code`),
    INDEX `invoices_created_by_idx`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `invoice_id` BIGINT NOT NULL,
    `line_number` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `item_id` INTEGER NULL,
    `item_code` VARCHAR(40) NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `hsn_sac_code` VARCHAR(20) NULL,
    `unit_code` VARCHAR(20) NULL,
    `quantity` DECIMAL(18, 3) NOT NULL,
    `rate` DECIMAL(18, 4) NOT NULL,
    `discount_mode` ENUM('NONE', 'PERCENT', 'AMOUNT') NOT NULL DEFAULT 'NONE',
    `discount_value` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `discount_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `line_gross` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `line_net` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `allocated_doc_discount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `taxable_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `tax_amount` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `line_total` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `tax_group_id` INTEGER NULL,
    `is_tax_exempt` BOOLEAN NOT NULL DEFAULT false,
    `exempt_reason` VARCHAR(120) NULL,

    INDEX `invoice_items_invoice_id_sort_order_idx`(`invoice_id`, `sort_order`),
    INDEX `invoice_items_item_id_idx`(`item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_item_taxes` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `invoice_item_id` BIGINT NOT NULL,
    `tax_rate_id` INTEGER NOT NULL,
    `tax_type_key` VARCHAR(20) NOT NULL,
    `label` VARCHAR(60) NOT NULL,
    `rate_percent` DECIMAL(9, 4) NOT NULL,
    `taxable_amount` DECIMAL(18, 4) NOT NULL,
    `tax_amount` DECIMAL(18, 4) NOT NULL,

    INDEX `invoice_item_taxes_invoice_item_id_idx`(`invoice_item_id`),
    INDEX `invoice_item_taxes_tax_rate_id_idx`(`tax_rate_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_revisions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `invoice_id` BIGINT NOT NULL,
    `version` INTEGER NOT NULL,
    `changed_by` INTEGER NOT NULL,
    `change_reason` VARCHAR(500) NULL,
    `previous_data_json` JSON NOT NULL,
    `new_data_json` JSON NOT NULL,
    `diff_summary_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `invoice_revisions_invoice_id_version_key`(`invoice_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_files` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `entity_type` ENUM('QUOTATION', 'INVOICE', 'CUSTOMER', 'ITEM', 'TEMPLATE', 'COMPANY', 'USER', 'ROLE', 'MASTER', 'REPORT') NOT NULL,
    `entity_id` BIGINT NULL,
    `kind` ENUM('GENERATED_PDF', 'ATTACHMENT', 'LOGO', 'SIGNATURE', 'SEAL', 'FAVICON', 'REPORT') NOT NULL,
    `document_version` INTEGER NULL,
    `template_version_id` INTEGER NULL,
    `storage_key` VARCHAR(500) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(120) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `checksum_sha256` CHAR(64) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `document_files_entity_type_entity_id_kind_idx`(`entity_type`, `entity_id`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_shares` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `entity_type` ENUM('QUOTATION', 'INVOICE', 'CUSTOMER', 'ITEM', 'TEMPLATE', 'COMPANY', 'USER', 'ROLE', 'MASTER', 'REPORT') NOT NULL,
    `entity_id` BIGINT NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `channel` ENUM('LINK', 'WHATSAPP') NOT NULL DEFAULT 'LINK',
    `expires_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `last_viewed_at` DATETIME(3) NULL,
    `created_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `document_shares_token_hash_key`(`token_hash`),
    INDEX `document_shares_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `user_email_snapshot` VARCHAR(190) NULL,
    `action` ENUM('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'USER_CREATED', 'USER_UPDATED', 'ROLE_CHANGED', 'ROLE_PERMISSIONS_UPDATED', 'SETTINGS_UPDATED', 'COMPANY_UPDATED', 'COMPANY_ASSET_UPDATED', 'BANK_ACCOUNT_CREATED', 'BANK_ACCOUNT_UPDATED', 'BANK_ACCOUNT_DELETED', 'MASTER_CREATED', 'MASTER_UPDATED', 'CUSTOMER_CREATED', 'CUSTOMER_UPDATED', 'CUSTOMER_ARCHIVED', 'ITEM_CREATED', 'ITEM_UPDATED', 'ITEM_ARCHIVED', 'TEMPLATE_CREATED', 'TEMPLATE_UPDATED', 'TEMPLATE_VERSION_PUBLISHED', 'TEMPLATE_DEFAULT_CHANGED', 'QUOTATION_CREATED', 'QUOTATION_UPDATED', 'QUOTATION_STATUS_CHANGED', 'QUOTATION_VIEWED', 'QUOTATION_CONVERTED', 'QUOTATION_DELETED', 'INVOICE_CREATED', 'INVOICE_UPDATED', 'INVOICE_STATUS_CHANGED', 'INVOICE_VIEWED', 'INVOICE_CANCELLED', 'INVOICE_VOIDED', 'INVOICE_DELETED', 'PAYMENT_STATUS_CHANGED', 'DOCUMENT_PDF_GENERATED', 'DOCUMENT_DOWNLOADED', 'DOCUMENT_SHARED', 'SHARE_REVOKED', 'REPORT_EXPORTED', 'BULK_DOWNLOAD') NOT NULL,
    `entity_type` ENUM('QUOTATION', 'INVOICE', 'CUSTOMER', 'ITEM', 'TEMPLATE', 'COMPANY', 'USER', 'ROLE', 'MASTER', 'REPORT') NOT NULL,
    `entity_id` BIGINT NULL,
    `entity_label` VARCHAR(190) NULL,
    `ip` VARCHAR(64) NULL,
    `user_agent` VARCHAR(255) NULL,
    `request_id` VARCHAR(40) NULL,
    `previous_data_json` JSON NULL,
    `new_data_json` JSON NULL,
    `metadata_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_entity_type_entity_id_created_at_idx`(`entity_type`, `entity_id`, `created_at`),
    INDEX `audit_logs_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `audit_logs_action_created_at_idx`(`action`, `created_at`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_bank_accounts` ADD CONSTRAINT `company_bank_accounts_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `company_settings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_sequences` ADD CONSTRAINT `document_sequences_numbering_series_id_fkey` FOREIGN KEY (`numbering_series_id`) REFERENCES `numbering_series`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_sequences` ADD CONSTRAINT `document_sequences_financial_year_id_fkey` FOREIGN KEY (`financial_year_id`) REFERENCES `financial_years`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tax_rates` ADD CONSTRAINT `tax_rates_tax_type_id_fkey` FOREIGN KEY (`tax_type_id`) REFERENCES `tax_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tax_group_rates` ADD CONSTRAINT `tax_group_rates_tax_group_id_fkey` FOREIGN KEY (`tax_group_id`) REFERENCES `tax_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tax_group_rates` ADD CONSTRAINT `tax_group_rates_tax_rate_id_fkey` FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_default_currency_code_fkey` FOREIGN KEY (`default_currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_addresses` ADD CONSTRAINT `customer_addresses_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_contacts` ADD CONSTRAINT `customer_contacts_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_default_tax_rate_id_fkey` FOREIGN KEY (`default_tax_rate_id`) REFERENCES `tax_rates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_default_tax_group_id_fkey` FOREIGN KEY (`default_tax_group_id`) REFERENCES `tax_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `item_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_versions` ADD CONSTRAINT `template_versions_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotations` ADD CONSTRAINT `quotations_financial_year_id_fkey` FOREIGN KEY (`financial_year_id`) REFERENCES `financial_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotations` ADD CONSTRAINT `quotations_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotations` ADD CONSTRAINT `quotations_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotations` ADD CONSTRAINT `quotations_template_version_id_fkey` FOREIGN KEY (`template_version_id`) REFERENCES `template_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotations` ADD CONSTRAINT `quotations_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotation_items` ADD CONSTRAINT `quotation_items_quotation_id_fkey` FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotation_items` ADD CONSTRAINT `quotation_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotation_item_taxes` ADD CONSTRAINT `quotation_item_taxes_quotation_item_id_fkey` FOREIGN KEY (`quotation_item_id`) REFERENCES `quotation_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotation_item_taxes` ADD CONSTRAINT `quotation_item_taxes_tax_rate_id_fkey` FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotation_revisions` ADD CONSTRAINT `quotation_revisions_quotation_id_fkey` FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_financial_year_id_fkey` FOREIGN KEY (`financial_year_id`) REFERENCES `financial_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_quotation_id_fkey` FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_currency_code_fkey` FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_template_version_id_fkey` FOREIGN KEY (`template_version_id`) REFERENCES `template_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_item_taxes` ADD CONSTRAINT `invoice_item_taxes_invoice_item_id_fkey` FOREIGN KEY (`invoice_item_id`) REFERENCES `invoice_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_item_taxes` ADD CONSTRAINT `invoice_item_taxes_tax_rate_id_fkey` FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_revisions` ADD CONSTRAINT `invoice_revisions_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

