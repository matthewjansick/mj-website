<?php
/**
 * Persistence: kid profiles, settings, agent status and the activity log.
 *
 * @package FamilyHub
 */

defined( 'ABSPATH' ) || exit;

final class Family_Hub_Store {

	const OPT_PROFILES   = 'family_hub_profiles';
	const OPT_SETTINGS   = 'family_hub_settings';
	const OPT_AGENT      = 'family_hub_agent';
	const OPT_CLIENTS    = 'family_hub_clients';
	const OPT_TOKEN_HASH = 'family_hub_agent_token_hash';
	const OPT_DB_VERSION = 'family_hub_db_version';

	const COLORS = array( 'teal', 'coral', 'violet', 'amber', 'sky', 'rose', 'lime', 'slate' );

	const MAX_EVENTS = 2000;

	public static function events_table() {
		global $wpdb;
		return $wpdb->prefix . 'family_hub_events';
	}

	/** Create/upgrade the events table. Also runs after SFTP/git deploys, which skip the activation hook. */
	public static function maybe_upgrade() {
		if ( (int) get_option( self::OPT_DB_VERSION, 0 ) >= FAMILY_HUB_DB_VERSION ) {
			return;
		}
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$table   = self::events_table();
		$charset = $wpdb->get_charset_collate();
		dbDelta(
			"CREATE TABLE {$table} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				ts int(10) unsigned NOT NULL,
				source varchar(20) NOT NULL DEFAULT '',
				actor varchar(60) NOT NULL DEFAULT '',
				profile_id varchar(20) NOT NULL DEFAULT '',
				type varchar(40) NOT NULL DEFAULT '',
				mac varchar(17) NOT NULL DEFAULT '',
				message varchar(255) NOT NULL DEFAULT '',
				PRIMARY KEY  (id),
				KEY ts (ts)
			) {$charset};"
		);
		update_option( self::OPT_DB_VERSION, FAMILY_HUB_DB_VERSION, false );
		// The dashboard URL is a rewrite rule; make sure it exists after a deploy.
		update_option( 'family_hub_flush_rewrites', 1, false );
	}

	// ---------------------------------------------------------------- profiles

	public static function profiles() {
		$profiles = get_option( self::OPT_PROFILES, array() );
		return is_array( $profiles ) ? array_values( $profiles ) : array();
	}

	public static function save_profiles( array $profiles ) {
		update_option( self::OPT_PROFILES, array_values( $profiles ), false );
	}

	public static function profile( $id ) {
		foreach ( self::profiles() as $p ) {
			if ( $p['id'] === $id ) {
				return $p;
			}
		}
		return null;
	}

	public static function put_profile( array $profile ) {
		$profiles = self::profiles();
		$found    = false;
		foreach ( $profiles as $i => $p ) {
			if ( $p['id'] === $profile['id'] ) {
				$profiles[ $i ] = $profile;
				$found          = true;
			}
		}
		if ( ! $found ) {
			$profiles[] = $profile;
		}
		self::save_profiles( $profiles );
	}

	public static function delete_profile( $id ) {
		$profiles = array_filter(
			self::profiles(),
			static function ( $p ) use ( $id ) {
				return $p['id'] !== $id;
			}
		);
		self::save_profiles( $profiles );
	}

	public static function new_profile_id() {
		do {
			$id = strtolower( wp_generate_password( 8, false, false ) );
		} while ( self::profile( $id ) );
		return $id;
	}

	// ---------------------------------------------------------------- settings

	public static function settings() {
		$s = get_option( self::OPT_SETTINGS, array() );
		return wp_parse_args(
			is_array( $s ) ? $s : array(),
			array(
				'enforcement'   => 'client_block',
				'poll_interval' => 10,
			)
		);
	}

	public static function save_settings( array $settings ) {
		update_option( self::OPT_SETTINGS, $settings, false );
	}

	// ---------------------------------------------------------------- agent

	public static function agent() {
		$a = get_option( self::OPT_AGENT, array() );
		return is_array( $a ) ? $a : array();
	}

	public static function save_agent( array $agent ) {
		update_option( self::OPT_AGENT, $agent, false );
	}

	public static function clients() {
		$c = get_option( self::OPT_CLIENTS, array() );
		return is_array( $c ) ? $c : array();
	}

	public static function save_clients( array $clients ) {
		update_option( self::OPT_CLIENTS, $clients, false );
	}

	public static function token_configured() {
		return (bool) get_option( self::OPT_TOKEN_HASH, '' );
	}

	/** Generate a new agent token. Only its hash is stored; the plain token is shown once. */
	public static function rotate_token() {
		$token = 'fh_' . wp_generate_password( 48, false, false );
		update_option( self::OPT_TOKEN_HASH, hash( 'sha256', $token ), false );
		return $token;
	}

	public static function verify_token( $token ) {
		$hash = (string) get_option( self::OPT_TOKEN_HASH, '' );
		if ( '' === $hash || ! is_string( $token ) || '' === $token ) {
			return false;
		}
		return hash_equals( $hash, hash( 'sha256', $token ) );
	}

	// ---------------------------------------------------------------- events

	public static function log_event( $type, $message = '', array $extra = array() ) {
		global $wpdb;
		$row = array(
			'ts'         => isset( $extra['ts'] ) ? (int) $extra['ts'] : time(),
			'source'     => isset( $extra['source'] ) ? substr( $extra['source'], 0, 20 ) : 'dashboard',
			'actor'      => isset( $extra['actor'] ) ? substr( $extra['actor'], 0, 60 ) : '',
			'profile_id' => isset( $extra['profile_id'] ) ? substr( $extra['profile_id'], 0, 20 ) : '',
			'type'       => substr( $type, 0, 40 ),
			'mac'        => isset( $extra['mac'] ) ? substr( $extra['mac'], 0, 17 ) : '',
			'message'    => substr( $message, 0, 255 ),
		);
		$wpdb->insert( self::events_table(), $row ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		if ( 0 === wp_rand( 0, 50 ) ) {
			self::prune_events();
		}
	}

	public static function events( $limit = 60 ) {
		global $wpdb;
		$table = self::events_table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} ORDER BY id DESC LIMIT %d", $limit ), ARRAY_A );
		return array_map(
			static function ( $r ) {
				$r['id'] = (int) $r['id'];
				$r['ts'] = (int) $r['ts'];
				return $r;
			},
			$rows ? $rows : array()
		);
	}

	private static function prune_events() {
		global $wpdb;
		$table = self::events_table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$cutoff = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$table} ORDER BY id DESC LIMIT 1 OFFSET %d", self::MAX_EVENTS ) );
		if ( $cutoff ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE id <= %d", $cutoff ) );
		}
	}

	// ---------------------------------------------------------------- validation

	public static function normalize_mac( $mac ) {
		if ( ! is_string( $mac ) ) {
			return null;
		}
		$mac = strtolower( str_replace( '-', ':', trim( $mac ) ) );
		return preg_match( '/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/', $mac ) ? $mac : null;
	}

	public static function is_hm( $value ) {
		return is_string( $value ) && preg_match( '/^([01]\d|2[0-3]):[0-5]\d$/', $value );
	}
}
