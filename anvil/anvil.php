<?php
/**
 * Plugin Name: Anvil
 * Plugin URI:  https://jansick.com/anvil
 * Description: Serves the Anvil app as an installable, iOS-style standalone web app at /anvil.
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
		'background_color' => '#f2f2f7',
		'theme_color'      => $theme,
		'icons'            => array(
			array(
				'src'     => ANVIL_URL . 'assets/icon.svg',
				'sizes'   => 'any',
				'type'    => 'image/svg+xml',
				'purpose' => 'any',
			),
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
