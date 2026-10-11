<?php
/**
 * The dashboard at /family (outside the theme), plus a wp-admin shortcut.
 *
 * @package FamilyHub
 */

defined( 'ABSPATH' ) || exit;

final class Family_Hub_Page {

	public static function init() {
		add_rewrite_rule( '^' . preg_quote( FAMILY_HUB_SLUG, '/' ) . '/?$', 'index.php?family_hub=1', 'top' );
		add_filter( 'query_vars', array( __CLASS__, 'query_vars' ) );
		add_action( 'template_redirect', array( __CLASS__, 'render' ), 0 );
		add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( FAMILY_HUB_FILE ), array( __CLASS__, 'action_links' ) );

		if ( get_option( 'family_hub_flush_rewrites' ) ) {
			delete_option( 'family_hub_flush_rewrites' );
			flush_rewrite_rules( false );
		}
	}

	public static function activate() {
		Family_Hub_Store::maybe_upgrade();
		update_option( 'family_hub_flush_rewrites', 1, false );
	}

	public static function deactivate() {
		flush_rewrite_rules( false );
	}

	public static function url() {
		return home_url( '/' . FAMILY_HUB_SLUG . '/' );
	}

	public static function query_vars( $vars ) {
		$vars[] = 'family_hub';
		return $vars;
	}

	public static function admin_menu() {
		add_menu_page( 'Family Hub', 'Family Hub', Family_Hub_REST::capability(), 'family-hub', array( __CLASS__, 'admin_redirect' ), 'dashicons-groups', 3 );
		// The menu item links straight to the dashboard.
		global $menu;
		foreach ( (array) $menu as $i => $item ) {
			if ( isset( $item[2] ) && 'family-hub' === $item[2] ) {
				$menu[ $i ][2] = self::url(); // phpcs:ignore WordPress.WP.GlobalVariablesOverride
			}
		}
	}

	public static function admin_redirect() {
		wp_safe_redirect( self::url() );
		exit;
	}

	public static function action_links( $links ) {
		array_unshift( $links, '<a href="' . esc_url( self::url() ) . '">Open dashboard</a>' );
		return $links;
	}

	public static function render() {
		if ( ! get_query_var( 'family_hub' ) ) {
			return;
		}
		nocache_headers();
		header( 'X-Robots-Tag: noindex, nofollow', true );
		header( 'X-Frame-Options: DENY', true );
		header( 'Referrer-Policy: same-origin', true );

		if ( ! is_user_logged_in() ) {
			auth_redirect();
		}
		if ( ! current_user_can( Family_Hub_REST::capability() ) ) {
			status_header( 403 );
			wp_die( 'You do not have access to the Family Hub.', 'Family Hub', array( 'response' => 403 ) );
		}

		$boot = array(
			'rest'      => esc_url_raw( rest_url( Family_Hub_REST::NS . '/' ) ),
			'nonce'     => wp_create_nonce( 'wp_rest' ),
			'user'      => wp_get_current_user()->display_name,
			'logout'    => wp_logout_url( self::url() ),
			'admin'     => admin_url(),
			'hubUrl'    => home_url(),
			'colors'    => Family_Hub_Store::COLORS,
			'timeFormat'=> get_option( 'time_format', 'g:i a' ),
		);
		require FAMILY_HUB_DIR . 'templates/dashboard.php';
		exit;
	}
}
