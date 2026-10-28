<?php
/**
 * Plugin Name: Anvil
 * Plugin URI:  https://jansick.com/anvil
 * Description: Hold Fast, The Anvil Academy Fall Retreat 2026 packet as an installable, iOS-style app at /anvil.
 * Version:     0.1.0
 * Author:      Matthew Jansick
 * License:     GPL-2.0-or-later
 * Text Domain: anvil
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ANVIL_VERSION', '0.1.0' );
define( 'ANVIL_SLUG', 'anvil' );
define( 'ANVIL_DIR', plugin_dir_path( __FILE__ ) );
define( 'ANVIL_URL', plugin_dir_url( __FILE__ ) );

/**
 * Routes: /anvil (the app), /anvil/manifest.webmanifest, /anvil/content.json
 */
function anvil_add_rewrite_rules() {
	add_rewrite_rule( '^' . ANVIL_SLUG . '/?$', 'index.php?anvil_route=app', 'top' );
	add_rewrite_rule( '^' . ANVIL_SLUG . '/manifest\.webmanifest$', 'index.php?anvil_route=manifest', 'top' );
	add_rewrite_rule( '^' . ANVIL_SLUG . '/content\.json$', 'index.php?anvil_route=content', 'top' );
}
add_action( 'init', 'anvil_add_rewrite_rules' );

function anvil_query_vars( $vars ) {
	$vars[] = 'anvil_route';
	return $vars;
}
add_filter( 'query_vars', 'anvil_query_vars' );

function anvil_activate() {
	anvil_add_rewrite_rules();
	flush_rewrite_rules();
}
register_activation_hook( __FILE__, 'anvil_activate' );

function anvil_deactivate() {
	flush_rewrite_rules();
}
register_deactivation_hook( __FILE__, 'anvil_deactivate' );

/**
 * Serve the requested route and stop WordPress from loading the theme.
 */
function anvil_template_redirect() {
	$route = get_query_var( 'anvil_route' );
	if ( ! $route ) {
		return;
	}

	nocache_headers();

	switch ( $route ) {
		case 'manifest':
			header( 'Content-Type: application/manifest+json; charset=utf-8' );
			echo wp_json_encode( anvil_manifest(), JSON_UNESCAPED_SLASHES );
			exit;

		case 'content':
			header( 'Content-Type: application/json; charset=utf-8' );
			readfile( ANVIL_DIR . 'assets/content.json' );
			exit;

		case 'app':
		default:
			status_header( 200 );
			header( 'Content-Type: text/html; charset=utf-8' );
			include ANVIL_DIR . 'app.php';
			exit;
	}
}
add_action( 'template_redirect', 'anvil_template_redirect' );

/**
 * Web app manifest for Add to Home Screen.
 */
function anvil_manifest() {
	$content = anvil_content();
	$name    = isset( $content['app']['name'] ) ? $content['app']['name'] : 'Anvil';
	$theme   = isset( $content['app']['theme'] ) ? $content['app']['theme'] : '#0a84ff';

	return array(
		'name'             => $name,
		'short_name'       => $name,
		'start_url'        => home_url( '/' . ANVIL_SLUG . '/' ),
		'scope'            => home_url( '/' . ANVIL_SLUG . '/' ),
		'display'          => 'standalone',
		'orientation'      => 'portrait',
		'background_color' => '#f3eee4',
		'theme_color'      => $theme,
		'icons'            => array(
			array(
				'src'     => ANVIL_URL . 'assets/icon-512.png',
				'sizes'   => '512x512',
				'type'    => 'image/png',
				'purpose' => 'any maskable',
			),
		),
	);
}

/**
 * Decoded app content (screens, lists, detail text).
 */
function anvil_content() {
	static $cache = null;
	if ( null === $cache ) {
		$raw   = file_get_contents( ANVIL_DIR . 'assets/content.json' );
		$cache = json_decode( $raw, true );
		if ( ! is_array( $cache ) ) {
			$cache = array( 'app' => array( 'name' => 'Anvil' ), 'tabs' => array() );
		}
	}
	return $cache;
}

/**
 * Notes sync: a tiny REST API that stores the family's notes in a WordPress
 * option, protected by a passcode set under Settings > Hold Fast.
 */
function anvil_notes_key() {
	if ( defined( 'ANVIL_NOTES_KEY' ) && ANVIL_NOTES_KEY ) {
		return (string) ANVIL_NOTES_KEY;
	}
	return (string) get_option( 'anvil_notes_key', '' );
}

function anvil_rest_permission( $request ) {
	$key = anvil_notes_key();
	if ( '' === $key ) {
		return new WP_Error( 'anvil_no_key', 'Set a passcode under Settings > Hold Fast first.', array( 'status' => 403 ) );
	}
	$sent = (string) $request->get_header( 'x-anvil-key' );
	if ( ! hash_equals( $key, $sent ) ) {
		return new WP_Error( 'anvil_bad_key', 'Wrong passcode.', array( 'status' => 401 ) );
	}
	return true;
}

function anvil_rest_routes() {
	register_rest_route( 'anvil/v1', '/notes', array(
		array(
			'methods'             => 'GET',
			'callback'            => 'anvil_rest_get_notes',
			'permission_callback' => 'anvil_rest_permission',
		),
		array(
			'methods'             => 'POST',
			'callback'            => 'anvil_rest_save_notes',
			'permission_callback' => 'anvil_rest_permission',
		),
	) );
}
add_action( 'rest_api_init', 'anvil_rest_routes' );

function anvil_rest_get_notes() {
	$data = get_option( 'anvil_notes', array() );
	return rest_ensure_response( is_array( $data ) ? $data : array() );
}

/**
 * Body: { "entries": { "<key>": { "value": <json>, "updated": <ms> } } }
 * Entries merge per key; the newer "updated" wins. Returns the merged set.
 */
function anvil_rest_save_notes( $request ) {
	$body    = $request->get_json_params();
	$entries = isset( $body['entries'] ) && is_array( $body['entries'] ) ? $body['entries'] : array();
	$stored  = get_option( 'anvil_notes', array() );
	if ( ! is_array( $stored ) ) {
		$stored = array();
	}
	foreach ( $entries as $key => $entry ) {
		$key = sanitize_text_field( (string) $key );
		if ( '' === $key || strlen( $key ) > 100 || ! is_array( $entry ) ) {
			continue;
		}
		$updated = isset( $entry['updated'] ) ? (int) $entry['updated'] : 0;
		if ( isset( $stored[ $key ]['updated'] ) && (int) $stored[ $key ]['updated'] >= $updated ) {
			continue;
		}
		$stored[ $key ] = array(
			'value'   => anvil_sanitize_deep( isset( $entry['value'] ) ? $entry['value'] : '' ),
			'updated' => $updated,
		);
	}
	if ( strlen( wp_json_encode( $stored ) ) > 1048576 ) {
		return new WP_Error( 'anvil_too_big', 'Notes are too large to save.', array( 'status' => 413 ) );
	}
	update_option( 'anvil_notes', $stored, false );
	return rest_ensure_response( $stored );
}

function anvil_sanitize_deep( $v ) {
	if ( is_array( $v ) ) {
		$out = array();
		foreach ( $v as $k => $x ) {
			$out[ sanitize_text_field( (string) $k ) ] = anvil_sanitize_deep( $x );
		}
		return $out;
	}
	if ( is_bool( $v ) || is_int( $v ) || is_float( $v ) ) {
		return $v;
	}
	return sanitize_textarea_field( (string) $v );
}

/* Settings > Hold Fast: the family passcode. */
function anvil_settings_menu() {
	add_options_page( 'Hold Fast', 'Hold Fast', 'manage_options', 'anvil', 'anvil_settings_page' );
}
add_action( 'admin_menu', 'anvil_settings_menu' );

function anvil_settings_init() {
	register_setting( 'anvil', 'anvil_notes_key', array( 'sanitize_callback' => 'sanitize_text_field' ) );
}
add_action( 'admin_init', 'anvil_settings_init' );

function anvil_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$count = count( (array) get_option( 'anvil_notes', array() ) );
	?>
	<div class="wrap">
		<h1>Hold Fast</h1>
		<p>The app lives at <a href="<?php echo esc_url( home_url( '/' . ANVIL_SLUG . '/' ) ); ?>"><?php echo esc_html( home_url( '/' . ANVIL_SLUG . '/' ) ); ?></a>.</p>
		<form method="post" action="options.php">
			<?php settings_fields( 'anvil' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="anvil_notes_key">Family passcode</label></th>
					<td>
						<input type="text" id="anvil_notes_key" name="anvil_notes_key" class="regular-text" value="<?php echo esc_attr( get_option( 'anvil_notes_key', '' ) ); ?>" <?php disabled( defined( 'ANVIL_NOTES_KEY' ) ); ?>>
						<p class="description">Enter this once in the app (More &gt; Save notes to jansick.com) to save notes to this site. Leave blank to keep notes on the phone only.<?php if ( defined( 'ANVIL_NOTES_KEY' ) ) echo ' Set in wp-config.php.'; ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row">Saved notes</th>
					<td><?php echo (int) $count; ?> saved entries.</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}
