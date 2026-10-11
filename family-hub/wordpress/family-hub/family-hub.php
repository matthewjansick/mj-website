<?php
/**
 * Plugin Name:       Family Hub
 * Description:       Self-hosted parental controls: pause internet, downtime schedules and bonus time for each kid's devices, enforced on your UniFi network by a small home agent. Dashboard lives at /family.
 * Version:           0.3.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Matthew Jansick
 * License:           GPL-2.0-or-later
 * Text Domain:       family-hub
 */

defined( 'ABSPATH' ) || exit;

define( 'FAMILY_HUB_VERSION', '0.3.0' );
define( 'FAMILY_HUB_DB_VERSION', 2 );
define( 'FAMILY_HUB_FILE', __FILE__ );
define( 'FAMILY_HUB_DIR', plugin_dir_path( __FILE__ ) );
define( 'FAMILY_HUB_URL', plugin_dir_url( __FILE__ ) );
if ( ! defined( 'FAMILY_HUB_SLUG' ) ) {
	// Override in wp-config.php to move the dashboard, e.g. define( 'FAMILY_HUB_SLUG', 'kids' ).
	define( 'FAMILY_HUB_SLUG', 'family' );
}

require_once FAMILY_HUB_DIR . 'includes/class-family-hub-store.php';
require_once FAMILY_HUB_DIR . 'includes/class-family-hub-schedule.php';
require_once FAMILY_HUB_DIR . 'includes/class-family-hub-notify.php';
require_once FAMILY_HUB_DIR . 'includes/class-family-hub-rest.php';
require_once FAMILY_HUB_DIR . 'includes/class-family-hub-page.php';

register_activation_hook( __FILE__, array( 'Family_Hub_Page', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'Family_Hub_Page', 'deactivate' ) );

add_action( 'plugins_loaded', array( 'Family_Hub_Store', 'maybe_upgrade' ) );
add_action( 'init', array( 'Family_Hub_Page', 'init' ) );
add_action( 'init', array( 'Family_Hub_Notify', 'init' ) );
add_action( 'rest_api_init', array( 'Family_Hub_REST', 'register_routes' ) );
