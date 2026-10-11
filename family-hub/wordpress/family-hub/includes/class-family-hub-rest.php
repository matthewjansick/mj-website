<?php
/**
 * REST API: the dashboard (cookie + nonce auth, parents only) and the home
 * agent (token auth, one endpoint).
 *
 * @package FamilyHub
 */

defined( 'ABSPATH' ) || exit;

final class Family_Hub_REST {

	const NS = 'family-hub/v1';

	public static function capability() {
		/** Filter the capability required to use the Family Hub dashboard. */
		return apply_filters( 'family_hub_capability', 'manage_options' );
	}

	public static function register_routes() {
		$parent = array( __CLASS__, 'can_manage' );
		$id     = '(?P<id>[a-z0-9]{1,20})';

		register_rest_route(
			self::NS,
			'/agent/sync',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'agent_sync' ),
				'permission_callback' => array( __CLASS__, 'is_agent' ),
			)
		);
		register_rest_route( self::NS, '/state', array( 'methods' => 'GET', 'callback' => array( __CLASS__, 'state' ), 'permission_callback' => $parent ) );
		register_rest_route( self::NS, '/profiles', array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'save_profile' ), 'permission_callback' => $parent ) );
		register_rest_route(
			self::NS,
			"/profiles/{$id}",
			array(
				array( 'methods' => 'PUT', 'callback' => array( __CLASS__, 'save_profile' ), 'permission_callback' => $parent ),
				array( 'methods' => 'DELETE', 'callback' => array( __CLASS__, 'delete_profile' ), 'permission_callback' => $parent ),
			)
		);
		register_rest_route( self::NS, "/profiles/{$id}/override", array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'override' ), 'permission_callback' => $parent ) );
		register_rest_route( self::NS, '/override-all', array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'override_all' ), 'permission_callback' => $parent ) );
		register_rest_route( self::NS, '/settings', array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'save_settings' ), 'permission_callback' => $parent ) );
		register_rest_route( self::NS, '/sms/test', array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'test_sms' ), 'permission_callback' => $parent ) );
		register_rest_route( self::NS, '/agent/token', array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'rotate_token' ), 'permission_callback' => $parent ) );
	}

	public static function can_manage() {
		return current_user_can( self::capability() );
	}

	public static function is_agent( WP_REST_Request $request ) {
		return Family_Hub_Store::verify_token( $request->get_header( 'x_family_hub_token' ) );
	}

	private static function no_cache( $data ) {
		$response = rest_ensure_response( $data );
		$response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, private' );
		return $response;
	}

	private static function actor() {
		$user = wp_get_current_user();
		return $user && $user->exists() ? $user->display_name : '';
	}

	// ------------------------------------------------------------------ agent

	public static function agent_sync( WP_REST_Request $request ) {
		$body = $request->get_json_params();
		$body = is_array( $body ) ? $body : array();
		$now  = time();

		if ( empty( $body['probe'] ) ) {
			$gateway = isset( $body['gateway'] ) && is_array( $body['gateway'] ) ? $body['gateway'] : array();
			$clean_g = array();
			foreach ( array( 'controller_type', 'gateway_model', 'gateway_name', 'gateway_firmware', 'network_version', 'error' ) as $k ) {
				if ( isset( $gateway[ $k ] ) && is_scalar( $gateway[ $k ] ) ) {
					$clean_g[ $k ] = substr( sanitize_text_field( (string) $gateway[ $k ] ), 0, 200 );
				}
			}
			$clean_g['ok'] = ! empty( $gateway['ok'] );

			$applied = array();
			if ( isset( $body['applied'] ) && is_array( $body['applied'] ) ) {
				foreach ( $body['applied'] as $mac => $blocked ) {
					$mac = Family_Hub_Store::normalize_mac( $mac );
					if ( $mac ) {
						$applied[ $mac ] = (bool) $blocked;
					}
				}
			}

			$previous = Family_Hub_Store::agent();
			if ( empty( $previous['last_seen'] ) || $now - (int) $previous['last_seen'] > 300 ) {
				Family_Hub_Store::log_event( 'agent_online', 'Home agent connected', array( 'source' => 'agent' ) );
			}
			Family_Hub_Store::save_agent(
				array(
					'last_seen' => $now,
					'version'   => isset( $body['agent_version'] ) ? sanitize_text_field( (string) $body['agent_version'] ) : '',
					'hostname'  => isset( $body['hostname'] ) ? sanitize_text_field( (string) $body['hostname'] ) : '',
					'gateway'   => $clean_g,
					'applied'   => $applied,
				)
			);

			if ( isset( $body['clients'] ) && is_array( $body['clients'] ) ) {
				Family_Hub_Store::save_clients( self::clean_clients( $body['clients'] ) );
			}

			if ( isset( $body['events'] ) && is_array( $body['events'] ) ) {
				foreach ( array_slice( $body['events'], 0, 100 ) as $e ) {
					if ( ! is_array( $e ) || empty( $e['type'] ) ) {
						continue;
					}
					$mac = isset( $e['mac'] ) ? Family_Hub_Store::normalize_mac( $e['mac'] ) : null;
					Family_Hub_Store::log_event(
						sanitize_key( $e['type'] ),
						isset( $e['message'] ) ? sanitize_text_field( (string) $e['message'] ) : '',
						array(
							'source'     => 'agent',
							'ts'         => isset( $e['ts'] ) ? min( $now, absint( $e['ts'] ) ) : $now,
							'profile_id' => isset( $e['profile_id'] ) ? sanitize_key( $e['profile_id'] ) : '',
							'mac'        => $mac ? $mac : '',
						)
					);
				}
			}
		}

		Family_Hub_Notify::tick( $now );

		$settings = Family_Hub_Store::settings();
		return self::no_cache(
			array(
				'config'        => self::agent_config(),
				'poll_interval' => (int) $settings['poll_interval'],
				'server_time'   => $now,
			)
		);
	}

	private static function clean_clients( array $clients ) {
		$out = array();
		foreach ( array_slice( $clients, 0, 500 ) as $c ) {
			if ( ! is_array( $c ) ) {
				continue;
			}
			$mac = Family_Hub_Store::normalize_mac( isset( $c['mac'] ) ? $c['mac'] : '' );
			if ( ! $mac ) {
				continue;
			}
			$text = static function ( $key ) use ( $c ) {
				return isset( $c[ $key ] ) && is_scalar( $c[ $key ] ) ? substr( sanitize_text_field( (string) $c[ $key ] ), 0, 80 ) : '';
			};
			$out[ $mac ] = array(
				'mac'        => $mac,
				'name'       => $text( 'name' ),
				'hostname'   => $text( 'hostname' ),
				'oui'        => $text( 'oui' ),
				'ip'         => $text( 'ip' ),
				'network'    => $text( 'network' ),
				'online'     => ! empty( $c['online'] ),
				'wired'      => ! empty( $c['wired'] ),
				'blocked'    => ! empty( $c['blocked'] ),
				'randomized' => ! empty( $c['randomized'] ),
				'last_seen'  => isset( $c['last_seen'] ) ? absint( $c['last_seen'] ) : 0,
			);
		}
		return array( 'updated' => time(), 'items' => $out );
	}

	/** What the agent needs to enforce, and nothing else. */
	private static function agent_config() {
		$settings = Family_Hub_Store::settings();
		$profiles = array();
		foreach ( Family_Hub_Store::profiles() as $p ) {
			$profiles[] = array(
				'id'       => $p['id'],
				'name'     => $p['name'],
				'enabled'  => ! empty( $p['enabled'] ),
				'devices'  => array_values( wp_list_pluck( $p['devices'], 'mac' ) ),
				'schedule' => $p['schedule'],
				'override' => isset( $p['override'] ) ? $p['override'] : null,
			);
		}
		return array(
			'timezone'    => wp_timezone_string(),
			'enforcement' => $settings['enforcement'],
			'profiles'    => $profiles,
		);
	}

	// ------------------------------------------------------------------ dashboard

	public static function state() {
		$now      = time();
		$agent    = Family_Hub_Store::agent();
		$settings = Family_Hub_Store::settings();
		$clients  = Family_Hub_Store::clients();
		$items    = isset( $clients['items'] ) ? $clients['items'] : array();
		$applied  = isset( $agent['applied'] ) ? $agent['applied'] : array();
		$assigned = array();
		$notify   = Family_Hub_Notify::state();

		$profiles = array();
		foreach ( Family_Hub_Store::profiles() as $p ) {
			$status  = Family_Hub_Schedule::status( $p, $now );
			$devices = array();
			$pending = false;
			foreach ( $p['devices'] as $d ) {
				$mac              = $d['mac'];
				$assigned[ $mac ] = $p['id'];
				$client           = isset( $items[ $mac ] ) ? $items[ $mac ] : null;
				$want             = 'disabled' === $status['reason'] ? null : $status['blocked'];
				$is_applied       = array_key_exists( $mac, $applied ) ? $applied[ $mac ] : null;
				if ( null !== $want && $is_applied !== $want ) {
					$pending = true;
				}
				$devices[] = array(
					'mac'     => $mac,
					'label'   => $d['label'],
					'client'  => $client,
					'applied' => $is_applied,
				);
			}
			$p['devices'] = $devices;
			$p['status']  = $status;
			$next         = Family_Hub_Notify::next_cutoff( $p, $now );
			$p['cutoff']  = $next && $next['at'] - $now <= DAY_IN_SECONDS ? $next : null;
			$p['extended'] = ! empty( $notify[ $p['id'] ]['extended'] ) && ! empty( $notify[ $p['id'] ]['target'] );
			$p['pending'] = $pending && ! empty( $devices );
			$profiles[]   = $p;
		}

		$last_seen = isset( $agent['last_seen'] ) ? (int) $agent['last_seen'] : 0;
		return self::no_cache(
			array(
				'now'      => $now,
				'timezone' => wp_timezone_string(),
				'profiles' => $profiles,
				'clients'  => array_values( $items ),
				'assigned' => $assigned,
				'agent'    => array(
					'configured' => Family_Hub_Store::token_configured(),
					'last_seen'  => $last_seen,
					'online'     => $last_seen && ( $now - $last_seen ) < max( 60, 4 * (int) $settings['poll_interval'] ),
					'version'    => isset( $agent['version'] ) ? $agent['version'] : '',
					'hostname'   => isset( $agent['hostname'] ) ? $agent['hostname'] : '',
					'gateway'    => isset( $agent['gateway'] ) ? $agent['gateway'] : array(),
				),
				'settings' => $settings,
				'sms'      => array(
					'key_set'      => '' !== Family_Hub_Notify::api_key(),
					'key_constant' => defined( 'FAMILY_HUB_BREVO_API_KEY' ),
					'defaults'     => Family_Hub_Notify::default_templates(),
				),
				'window'   => Family_Hub_Notify::window( $settings ),
				'events'   => Family_Hub_Store::events( 60 ),
			)
		);
	}

	public static function save_profile( WP_REST_Request $request ) {
		$id       = $request->get_param( 'id' );
		$existing = $id ? Family_Hub_Store::profile( $id ) : null;
		if ( $id && ! $existing ) {
			return new WP_Error( 'not_found', 'No such profile.', array( 'status' => 404 ) );
		}
		$in = $request->get_json_params();
		$in = is_array( $in ) ? $in : array();

		$name = isset( $in['name'] ) ? trim( sanitize_text_field( (string) $in['name'] ) ) : '';
		if ( '' === $name ) {
			return new WP_Error( 'invalid', 'Give this profile a name.', array( 'status' => 400 ) );
		}

		$devices = array();
		foreach ( isset( $in['devices'] ) && is_array( $in['devices'] ) ? array_slice( $in['devices'], 0, 50 ) : array() as $d ) {
			$mac = Family_Hub_Store::normalize_mac( is_array( $d ) && isset( $d['mac'] ) ? $d['mac'] : $d );
			if ( ! $mac ) {
				return new WP_Error( 'invalid', 'One of the device MAC addresses is not valid.', array( 'status' => 400 ) );
			}
			$devices[ $mac ] = array(
				'mac'   => $mac,
				'label' => is_array( $d ) && isset( $d['label'] ) ? substr( sanitize_text_field( (string) $d['label'] ), 0, 60 ) : '',
			);
		}

		$schedule = array();
		foreach ( isset( $in['schedule'] ) && is_array( $in['schedule'] ) ? array_slice( $in['schedule'], 0, 20 ) : array() as $r ) {
			if ( ! is_array( $r ) || ! Family_Hub_Store::is_hm( isset( $r['start'] ) ? $r['start'] : '' ) || ! Family_Hub_Store::is_hm( isset( $r['end'] ) ? $r['end'] : '' ) ) {
				return new WP_Error( 'invalid', 'Each downtime rule needs a start and end time.', array( 'status' => 400 ) );
			}
			$days = array_values(
				array_unique(
					array_filter(
						array_map( 'intval', isset( $r['days'] ) ? (array) $r['days'] : array() ),
						static function ( $d ) {
							return $d >= 0 && $d <= 6;
						}
					)
				)
			);
			sort( $days );
			if ( ! $days ) {
				return new WP_Error( 'invalid', 'Each downtime rule needs at least one day.', array( 'status' => 400 ) );
			}
			$schedule[] = array(
				'days'  => $days,
				'start' => $r['start'],
				'end'   => $r['end'],
			);
		}

		$phone = Family_Hub_Notify::normalize_phone( isset( $in['phone'] ) ? (string) $in['phone'] : '' );
		if ( null === $phone ) {
			return new WP_Error( 'invalid', 'That phone number is not valid.', array( 'status' => 400 ) );
		}

		$color   = isset( $in['color'] ) && in_array( $in['color'], Family_Hub_Store::COLORS, true ) ? $in['color'] : 'teal';
		$profile = array(
			'id'       => $existing ? $existing['id'] : Family_Hub_Store::new_profile_id(),
			'name'     => substr( $name, 0, 40 ),
			'color'    => $color,
			'enabled'  => ! isset( $in['enabled'] ) || (bool) $in['enabled'],
			'phone'    => $phone,
			'devices'  => array_values( $devices ),
			'schedule' => $schedule,
			'override' => $existing && isset( $existing['override'] ) ? $existing['override'] : null,
		);
		Family_Hub_Store::put_profile( $profile );
		Family_Hub_Store::log_event(
			$existing ? 'profile_updated' : 'profile_created',
			sprintf( '%s %s', $existing ? 'Updated' : 'Created', $profile['name'] ),
			array( 'actor' => self::actor(), 'profile_id' => $profile['id'] )
		);
		return self::state();
	}

	public static function delete_profile( WP_REST_Request $request ) {
		$p = Family_Hub_Store::profile( $request->get_param( 'id' ) );
		if ( ! $p ) {
			return new WP_Error( 'not_found', 'No such profile.', array( 'status' => 404 ) );
		}
		Family_Hub_Store::delete_profile( $p['id'] );
		Family_Hub_Store::log_event( 'profile_deleted', 'Deleted ' . $p['name'], array( 'actor' => self::actor() ) );
		return self::state();
	}

	/**
	 * Body: { mode: "block"|"allow"|"clear", minutes?: int, until?: unix, extend?: bool }
	 * No minutes/until means "until I turn it off".
	 */
	private static function apply_override( array $profile, array $in ) {
		$now  = time();
		$mode = isset( $in['mode'] ) ? $in['mode'] : '';
		if ( 'clear' === $mode ) {
			$profile['override'] = null;
			return array( $profile, 'Back to schedule' );
		}
		if ( 'winddown' === $mode ) {
			// Texts go out at the warning marks; internet goes off at the end.
			$delay = isset( $in['delay'] ) ? min( 180, absint( $in['delay'] ) ) : (int) Family_Hub_Store::settings()['winddown_default'];
			if ( Family_Hub_Schedule::status( $profile, $now )['blocked'] ) {
				return array( $profile, null ); // Already offline: nothing to wind down.
			}
			$profile['override'] = array(
				'mode'  => 'block',
				'start' => $delay ? $now + $delay * 60 : null,
				'until' => null,
				'by'    => self::actor(),
				'at'    => $now,
			);
			return array( $profile, $delay ? sprintf( 'Wind-down started: off at %s', wp_date( get_option( 'time_format', 'g:i a' ), $now + $delay * 60 ) ) : 'Paused internet' );
		}
		if ( 'postpone' === $mode ) {
			$minutes = isset( $in['minutes'] ) ? min( 120, max( 1, absint( $in['minutes'] ) ) ) : 5;
			$updated = Family_Hub_Notify::postpone( $profile, $minutes, $now );
			if ( ! $updated ) {
				return new WP_Error( 'invalid', 'There is no cutoff coming up to push back.', array( 'status' => 400 ) );
			}
			$next = Family_Hub_Notify::next_cutoff( $updated, $now );
			return array( $updated, sprintf( '+%d min: off at %s', $minutes, wp_date( get_option( 'time_format', 'g:i a' ), $next ? $next['at'] : $now ) ) );
		}
		if ( ! in_array( $mode, array( 'block', 'allow' ), true ) ) {
			return new WP_Error( 'invalid', 'Unknown mode.', array( 'status' => 400 ) );
		}
		$until = null;
		if ( ! empty( $in['minutes'] ) ) {
			$minutes = min( 60 * 24 * 7, max( 1, absint( $in['minutes'] ) ) );
			$base    = $now;
			$current = isset( $profile['override'] ) ? $profile['override'] : null;
			if ( ! empty( $in['extend'] ) && $current && $current['mode'] === $mode && ! empty( $current['until'] ) && $current['until'] > $now ) {
				$base = (int) $current['until'];
			}
			$until = $base + $minutes * 60;
		} elseif ( ! empty( $in['at'] ) && Family_Hub_Store::is_hm( $in['at'] ) ) {
			// Next occurrence of HH:MM in the site's timezone, e.g. "until 7:00 AM".
			list( $h, $m ) = array_map( 'intval', explode( ':', $in['at'] ) );
			$next          = ( new DateTimeImmutable( 'now', wp_timezone() ) )->setTime( $h, $m );
			if ( $next->getTimestamp() <= $now ) {
				$next = $next->modify( '+1 day' )->setTime( $h, $m );
			}
			$until = $next->getTimestamp();
		} elseif ( ! empty( $in['until'] ) ) {
			$until = absint( $in['until'] );
			if ( $until <= $now || $until > $now + 30 * DAY_IN_SECONDS ) {
				return new WP_Error( 'invalid', 'That end time is not valid.', array( 'status' => 400 ) );
			}
		}
		$profile['override'] = array(
			'mode'  => $mode,
			'until' => $until,
			'by'    => self::actor(),
			'at'    => $now,
		);
		$what = 'block' === $mode ? 'Paused internet' : 'Allowed internet';
		$when = $until ? ' until ' . wp_date( get_option( 'time_format', 'g:i a' ), $until ) : '';
		return array( $profile, $what . $when );
	}

	public static function override( WP_REST_Request $request ) {
		$profile = Family_Hub_Store::profile( $request->get_param( 'id' ) );
		if ( ! $profile ) {
			return new WP_Error( 'not_found', 'No such profile.', array( 'status' => 404 ) );
		}
		$in     = $request->get_json_params();
		$result = self::apply_override( $profile, is_array( $in ) ? $in : array() );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		list( $profile, $message ) = $result;
		if ( null === $message ) {
			return new WP_Error( 'invalid', $profile['name'] . ' is already offline.', array( 'status' => 400 ) );
		}
		Family_Hub_Store::put_profile( $profile );
		Family_Hub_Store::log_event( 'override', $profile['name'] . ': ' . $message, array( 'actor' => self::actor(), 'profile_id' => $profile['id'] ) );
		return self::state();
	}

	public static function override_all( WP_REST_Request $request ) {
		$in       = $request->get_json_params();
		$in       = is_array( $in ) ? $in : array();
		$profiles = Family_Hub_Store::profiles();
		$message  = '';
		foreach ( $profiles as $i => $p ) {
			$result = self::apply_override( $p, $in );
			if ( is_wp_error( $result ) ) {
				return $result;
			}
			list( $profiles[ $i ], $msg ) = $result;
			$message                       = null === $msg ? $message : $msg;
		}
		Family_Hub_Store::save_profiles( $profiles );
		Family_Hub_Store::log_event( 'override', 'Everyone: ' . $message, array( 'actor' => self::actor() ) );
		return self::state();
	}

	public static function save_settings( WP_REST_Request $request ) {
		$in       = $request->get_json_params();
		$settings = Family_Hub_Store::settings();
		if ( isset( $in['enforcement'] ) && in_array( $in['enforcement'], array( 'client_block', 'traffic_rule' ), true ) ) {
			$settings['enforcement'] = $in['enforcement'];
		}
		if ( isset( $in['poll_interval'] ) ) {
			$settings['poll_interval'] = min( 120, max( 5, absint( $in['poll_interval'] ) ) );
		}
		foreach ( array( 'sms_enabled', 'winddown_bedtime' ) as $k ) {
			if ( isset( $in[ $k ] ) ) {
				$settings[ $k ] = (bool) $in[ $k ];
			}
		}
		if ( isset( $in['sms_sender'] ) ) {
			$settings['sms_sender'] = substr( preg_replace( '/[^A-Za-z0-9+ ]/', '', (string) $in['sms_sender'] ), 0, 15 );
		}
		if ( isset( $in['sms_prefix'] ) ) {
			$settings['sms_prefix'] = substr( sanitize_text_field( (string) $in['sms_prefix'] ), 0, 30 );
		}
		if ( isset( $in['winddown_default'] ) ) {
			$settings['winddown_default'] = min( 180, max( 1, absint( $in['winddown_default'] ) ) );
		}
		if ( isset( $in['warn_minutes'] ) && is_array( $in['warn_minutes'] ) ) {
			$marks = array_values( array_unique( array_filter( array_map( 'absint', $in['warn_minutes'] ) ) ) );
			rsort( $marks );
			$settings['warn_minutes'] = $marks ? array_slice( array_map( function ( $m ) { return min( 120, $m ); }, $marks ), 0, 5 ) : array( 15 );
		}
		if ( isset( $in['parents'] ) && is_array( $in['parents'] ) ) {
			$parents = array();
			foreach ( array_slice( $in['parents'], 0, 4 ) as $parent ) {
				$phone = Family_Hub_Notify::normalize_phone( isset( $parent['phone'] ) ? (string) $parent['phone'] : '' );
				if ( null === $phone ) {
					return new WP_Error( 'invalid', 'A parent phone number is not valid.', array( 'status' => 400 ) );
				}
				$name = isset( $parent['name'] ) ? substr( sanitize_text_field( (string) $parent['name'] ), 0, 30 ) : '';
				if ( $phone || $name ) {
					$parents[] = array( 'name' => $name, 'phone' => $phone );
				}
			}
			$settings['parents'] = $parents;
		}
		if ( isset( $in['templates'] ) && is_array( $in['templates'] ) ) {
			$templates = array();
			foreach ( Family_Hub_Notify::default_templates() as $k => $default ) {
				if ( isset( $in['templates'][ $k ] ) ) {
					$value = substr( sanitize_text_field( (string) $in['templates'][ $k ] ), 0, 300 );
					if ( '' !== $value && $value !== $default ) {
						$templates[ $k ] = $value;
					}
				}
			}
			$settings['templates'] = $templates;
		}
		if ( isset( $in['brevo_api_key'] ) && ! defined( 'FAMILY_HUB_BREVO_API_KEY' ) ) {
			// Write-only: never sent back to the browser.
			update_option( Family_Hub_Notify::OPT_API_KEY, trim( sanitize_text_field( (string) $in['brevo_api_key'] ) ), false );
		}
		Family_Hub_Store::save_settings( $settings );
		Family_Hub_Store::log_event( 'settings', 'Settings updated', array( 'actor' => self::actor() ) );
		return self::state();
	}

	public static function test_sms( WP_REST_Request $request ) {
		$phone = Family_Hub_Notify::normalize_phone( (string) $request->get_param( 'phone' ) );
		if ( ! $phone ) {
			return new WP_Error( 'invalid', 'Enter a phone number to test.', array( 'status' => 400 ) );
		}
		$settings = Family_Hub_Store::settings();
		$result   = Family_Hub_Notify::send_sms( $phone, trim( $settings['sms_prefix'] . ': Test from Family Hub. Texts are working!' ) );
		if ( is_wp_error( $result ) ) {
			Family_Hub_Store::log_event( 'sms_failed', 'Test text failed: ' . $result->get_error_message(), array( 'actor' => self::actor(), 'source' => 'sms' ) );
			return new WP_Error( 'sms_failed', $result->get_error_message(), array( 'status' => 502 ) );
		}
		Family_Hub_Store::log_event( 'sms_sent', 'Test text sent', array( 'actor' => self::actor(), 'source' => 'sms' ) );
		return self::no_cache( array( 'ok' => true ) );
	}

	public static function rotate_token() {
		$token = Family_Hub_Store::rotate_token();
		Family_Hub_Store::log_event( 'agent_token', 'New agent token generated (old token stops working)', array( 'actor' => self::actor() ) );
		return self::no_cache(
			array(
				'token'   => $token,
				'hub_url' => home_url(),
			)
		);
	}
}
