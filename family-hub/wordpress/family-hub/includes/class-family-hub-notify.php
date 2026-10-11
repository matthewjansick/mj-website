<?php
/**
 * Wind-down text alerts (Brevo SMS).
 *
 * For each kid it finds the next moment their internet goes off (a parent's
 * wind-down, bonus time ending, or scheduled bedtime), texts them at each
 * warning mark (15/5/1 min by default), lets them add 5 minutes once from a
 * link in the text, and tells parents when the cutoff has been confirmed by
 * the home agent.
 *
 * tick() runs on every agent check-in (~10 s) with WP-Cron as a fallback,
 * since WP-Cron on WP Engine only runs when the site gets traffic.
 *
 * @package FamilyHub
 */

defined( 'ABSPATH' ) || exit;

final class Family_Hub_Notify {

	const OPT_STATE   = 'family_hub_notify_state';
	const OPT_LOCK    = 'family_hub_notify_lock';
	const OPT_API_KEY = 'family_hub_brevo_api_key';
	const CRON_HOOK   = 'family_hub_tick';
	const EXTEND_MIN  = 5;
	const CONFIRM_SEC = 180; // Warn parents if the agent hasn't confirmed a cutoff by then.

	public static function init() {
		add_filter( 'cron_schedules', array( __CLASS__, 'cron_schedules' ) );
		add_action( self::CRON_HOOK, array( __CLASS__, 'tick' ) );
		if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
			wp_schedule_event( time() + 60, 'family_hub_minute', self::CRON_HOOK );
		}
	}

	public static function cron_schedules( $schedules ) {
		$schedules['family_hub_minute'] = array( 'interval' => 60, 'display' => 'Every minute (Family Hub)' );
		return $schedules;
	}

	public static function default_templates() {
		return array(
			'warn'               => '{prefix}: Screens off at {time} ({minutes} min). Start wrapping up. {more}',
			'final'              => '{prefix}: 1 minute left. Save your game!',
			'more'               => 'Need 5 more min? {link}',
			'cutoff'             => '{prefix}: Screens are off now. Thanks for wrapping up.',
			'extended'           => '{prefix}: OK, 5 more minutes. Screens off at {time}.',
			'moved'              => '{prefix}: Change of plans. Screens off at {time}.',
			'cancelled'          => '{prefix}: Never mind, screens can stay on for now.',
			'parent_cutoff'      => 'Family Hub: {names} offline now.',
			'parent_extended'    => 'Family Hub: {name} used their +5 min. Off at {time}.',
			'parent_unconfirmed' => 'Family Hub: {names} should be offline, but the home agent has not confirmed it. Check the Mac mini.',
		);
	}

	// ------------------------------------------------------------------ cutoff math

	/**
	 * Next time this kid goes from allowed to blocked (within 24 h), or null if
	 * they're blocked already / nothing is coming up.
	 *
	 * @return array{at:int, source:string}|null  source: winddown | bonus | bedtime
	 */
	public static function next_cutoff( array $p, $now ) {
		if ( empty( $p['enabled'] ) || Family_Hub_Schedule::status( $p, $now )['blocked'] ) {
			return null;
		}
		$o          = isset( $p['override'] ) && is_array( $p['override'] ) ? $p['override'] : array();
		$rules      = isset( $p['schedule'] ) ? (array) $p['schedule'] : array();
		$candidates = Family_Hub_Schedule::boundaries( $rules, $now, 1 );
		foreach ( array( 'start', 'until' ) as $k ) {
			if ( ! empty( $o[ $k ] ) && $o[ $k ] > $now ) {
				$candidates[] = (int) $o[ $k ];
			}
		}
		sort( $candidates );
		foreach ( array_unique( $candidates ) as $t ) {
			if ( $t > $now + DAY_IN_SECONDS ) {
				break;
			}
			if ( Family_Hub_Schedule::status( $p, $t )['blocked'] ) {
				$source = 'bedtime';
				if ( ! empty( $o['start'] ) && (int) $o['start'] === $t ) {
					$source = 'winddown';
				} elseif ( ! empty( $o['until'] ) && (int) $o['until'] === $t ) {
					$source = 'bonus';
				}
				return array( 'at' => $t, 'source' => $source );
			}
		}
		return null;
	}

	/** Largest warning mark in seconds: inside this window a cutoff counts as "winding down". */
	public static function window( array $settings ) {
		$marks = $settings['warn_minutes'] ? $settings['warn_minutes'] : array( 15 );
		return max( $marks ) * 60;
	}

	/**
	 * Push a kid's upcoming cutoff back by $minutes (kid's "+5 min" link or a
	 * parent's "+5 min" button). Returns the updated profile, or null if there
	 * is nothing to postpone.
	 */
	public static function postpone( array $p, $minutes, $now ) {
		$next = self::next_cutoff( $p, $now );
		if ( ! $next ) {
			return null;
		}
		$add = $minutes * 60;
		$o   = isset( $p['override'] ) && is_array( $p['override'] ) ? $p['override'] : null;
		if ( 'winddown' === $next['source'] ) {
			$o['start'] = (int) $o['start'] + $add;
		} elseif ( 'bonus' === $next['source'] ) {
			$o['until'] = (int) $o['until'] + $add;
		} else {
			// Bedtime: allow until a few minutes past the downtime start.
			$o = array( 'mode' => 'allow', 'until' => $next['at'] + $add, 'by' => 'extension', 'at' => $now );
		}
		$p['override'] = $o;
		return $p;
	}

	// ------------------------------------------------------------------ the loop

	public static function tick( $now = null ) {
		$now = null === $now ? time() : (int) $now;
		if ( ! self::lock( $now ) ) {
			return;
		}
		try {
			self::run( $now );
		} finally {
			delete_option( self::OPT_LOCK );
		}
	}

	private static function lock( $now ) {
		if ( add_option( self::OPT_LOCK, $now, '', 'no' ) ) {
			return true;
		}
		if ( $now - (int) get_option( self::OPT_LOCK ) > 60 ) { // stale lock from a crashed request
			update_option( self::OPT_LOCK, $now, false );
			return true;
		}
		return false;
	}

	private static function run( $now ) {
		$settings = Family_Hub_Store::settings();
		$state    = self::state();
		$applied  = Family_Hub_Store::agent();
		$applied  = isset( $applied['applied'] ) ? $applied['applied'] : array();
		$marks    = $settings['warn_minutes'];
		rsort( $marks );
		$window   = self::window( $settings );
		$offline  = array();
		$unknown  = array();

		$ids = array();
		foreach ( Family_Hub_Store::profiles() as $p ) {
			$id    = $p['id'];
			$ids[] = $id;
			$s     = isset( $state[ $id ] ) ? $state[ $id ] : self::blank();
			$st    = Family_Hub_Schedule::status( $p, $now );
			$phone = isset( $p['phone'] ) ? $p['phone'] : '';
			$vars  = array( 'name' => $p['name'] );

			if ( $st['blocked'] ) {
				if ( ! $s['blocked'] ) {
					// Just went offline.
					$s = array_merge( self::blank(), array( 'blocked' => true, 'blocked_at' => $now, 'confirmed' => false ) );
					self::text_kid( $p, 'cutoff', $vars );
				}
				if ( ! $s['confirmed'] ) {
					$macs = wp_list_pluck( $p['devices'], 'mac' );
					$done = true;
					foreach ( $macs as $mac ) {
						if ( empty( $applied[ $mac ] ) ) {
							$done = false;
						}
					}
					if ( $done ) {
						$offline[]      = $p['name'];
						$s['confirmed'] = true;
					} elseif ( $now - $s['blocked_at'] > self::CONFIRM_SEC ) {
						$unknown[]      = $p['name'];
						$s['confirmed'] = true;
					}
				}
				$state[ $id ] = $s;
				continue;
			}

			$s['blocked'] = false;
			$next         = self::next_cutoff( $p, $now );
			if ( $next && 'bedtime' === $next['source'] && empty( $settings['winddown_bedtime'] ) ) {
				$next = null;
			}
			$target = $next && ( $next['at'] - $now ) <= $window + 5 ? $next['at'] : null;

			if ( $target !== $s['target'] ) {
				$prev         = $s;
				$was_counting = $prev['target'] && $prev['target'] > $now && $prev['sent'];
				// The countdown we'd been warning about changed: a parent cancelled or moved it.
				if ( $was_counting ) {
					if ( $next ) {
						self::text_kid( $p, 'moved', $vars + array( 'time' => self::time( $next['at'] ) ) );
					} else {
						self::text_kid( $p, 'cancelled', $vars );
					}
				}
				$s = array_merge(
					self::blank(),
					array(
						'target' => $target,
						'token'  => $target ? strtolower( wp_generate_password( 10, false, false ) ) : '',
					)
				);
				// A +5 already used for this same cutoff stays used, even if the
				// cutoff drifted out of the warning window and back in.
				$s['extended_for'] = $prev['extended_for'];
				$s['extended']     = $next && $prev['extended_for'] === $next['at'];
				if ( $target && $was_counting ) {
					// Moved, not new: the "moved" text replaces marks that already passed,
					// and a +5 already used stays used.
					$s['sent']     = self::passed_marks( $marks, $target, $now );
					$s['extended'] = $prev['extended'];
				}
			}

			if ( $target ) {
				$left = $target - $now;
				$due  = array_diff( self::passed_marks( $marks, $target, $now ), $s['sent'] );
				if ( $due ) {
					$s['sent'] = array_values( array_unique( array_merge( $s['sent'], $due ) ) );
					if ( $left >= 20 ) {
						$minutes = max( 1, (int) round( $left / 60 ) );
						$more    = '';
						if ( empty( $s['extended'] ) && $left > 90 ) {
							$more = self::render( 'more', array( 'link' => self::extend_url( $s['token'] ) ) );
						}
						self::text_kid(
							$p,
							1 === $minutes && $left <= 90 ? 'final' : 'warn',
							$vars + array(
								'time'    => self::time( $target ),
								'minutes' => $minutes,
								'more'    => $more,
							)
						);
					}
				}
			}
			$state[ $id ] = $s;
		}

		$state = array_intersect_key( $state, array_flip( $ids ) );
		self::save_state( $state );

		if ( $offline ) {
			self::text_parents( 'parent_cutoff', array( 'names' => self::join_names( $offline ) ) );
		}
		if ( $unknown ) {
			self::text_parents( 'parent_unconfirmed', array( 'names' => self::join_names( $unknown ) ) );
		}
	}

	private static function passed_marks( array $marks, $target, $now ) {
		$out = array();
		foreach ( $marks as $m ) {
			if ( $target - $now <= $m * 60 + 5 ) {
				$out[] = (int) $m;
			}
		}
		return $out;
	}

	private static function blank() {
		return array(
			'target'     => null,
			'sent'       => array(),
			'token'      => '',
			'extended'   => false,
			'extended_for' => 0,
			'blocked'    => false,
			'blocked_at' => 0,
			'confirmed'  => true,
		);
	}

	public static function state() {
		$s = get_option( self::OPT_STATE, array() );
		return is_array( $s ) ? $s : array();
	}

	private static function save_state( array $state ) {
		update_option( self::OPT_STATE, $state, false );
	}

	// ------------------------------------------------------------------ kid's +5 link

	public static function extend_url( $token ) {
		return home_url( '/' . FAMILY_HUB_SLUG . '/more/' . $token );
	}

	/**
	 * Look up an extension link.
	 *
	 * @return array{status:string, profile?:array, target?:int}  status: ok | used | expired
	 */
	public static function find_token( $token ) {
		if ( ! is_string( $token ) || ! preg_match( '/^[a-z0-9]{10}$/', $token ) ) {
			return array( 'status' => 'expired' );
		}
		foreach ( self::state() as $id => $s ) {
			if ( ! empty( $s['token'] ) && hash_equals( $s['token'], $token ) ) {
				$p = Family_Hub_Store::profile( $id );
				if ( ! $p || ! $s['target'] || $s['target'] <= time() ) {
					return array( 'status' => 'expired' );
				}
				return array(
					'status'  => empty( $s['extended'] ) ? 'ok' : 'used',
					'profile' => $p,
					'target'  => (int) $s['target'],
				);
			}
		}
		return array( 'status' => 'expired' );
	}

	/** Kid tapped "+5 min". Allowed once per countdown. */
	public static function use_token( $token ) {
		$now = time();
		if ( ! self::lock( $now ) ) {
			usleep( 300000 );
			if ( ! self::lock( $now ) ) {
				return new WP_Error( 'busy', 'Try again in a moment.' );
			}
		}
		try {
			$found = self::find_token( $token );
			if ( 'ok' !== $found['status'] ) {
				return $found;
			}
			$p       = self::postpone( $found['profile'], self::EXTEND_MIN, $now );
			$updated = $p ? self::next_cutoff( $p, $now ) : null;
			if ( ! $updated ) {
				return array( 'status' => 'expired' );
			}
			Family_Hub_Store::put_profile( $p );

			$state                  = self::state();
			$s                      = $state[ $p['id'] ];
			$settings               = Family_Hub_Store::settings();
			$s['target']            = $updated['at'];
			$s['extended']          = true;
			$s['extended_for']      = $updated['at'];
			$s['sent']              = self::passed_marks( $settings['warn_minutes'], $updated['at'], $now );
			$state[ $p['id'] ]      = $s;
			self::save_state( $state );

			$vars = array( 'name' => $p['name'], 'time' => self::time( $updated['at'] ) );
			self::text_kid( $p, 'extended', $vars );
			self::text_parents( 'parent_extended', $vars );
			Family_Hub_Store::log_event( 'extended', $p['name'] . ' added 5 minutes (off at ' . $vars['time'] . ')', array( 'source' => 'kid', 'profile_id' => $p['id'] ) );
			return array( 'status' => 'extended', 'profile' => $p, 'target' => $updated['at'] );
		} finally {
			delete_option( self::OPT_LOCK );
		}
	}

	// ------------------------------------------------------------------ sending

	private static function text_kid( array $p, $template, array $vars ) {
		if ( empty( $p['phone'] ) ) {
			return;
		}
		self::send( $p['phone'], self::render( $template, $vars ), $p['name'], $p['id'] );
	}

	private static function text_parents( $template, array $vars ) {
		$settings = Family_Hub_Store::settings();
		$text     = self::render( $template, $vars );
		foreach ( $settings['parents'] as $parent ) {
			if ( ! empty( $parent['phone'] ) ) {
				self::send( $parent['phone'], $text, $parent['name'] ? $parent['name'] : 'parent', '' );
			}
		}
	}

	private static function render( $template, array $vars ) {
		$settings  = Family_Hub_Store::settings();
		$templates = wp_parse_args( $settings['templates'], self::default_templates() );
		$vars     += array( 'prefix' => $settings['sms_prefix'], 'more' => '' );
		$out       = isset( $templates[ $template ] ) ? $templates[ $template ] : '';
		foreach ( $vars as $k => $v ) {
			$out = str_replace( '{' . $k . '}', (string) $v, $out );
		}
		return trim( preg_replace( '/\s+/', ' ', $out ) );
	}

	private static function time( $ts ) {
		return wp_date( get_option( 'time_format', 'g:i a' ), $ts );
	}

	private static function join_names( array $names ) {
		if ( count( $names ) < 3 ) {
			return implode( ' and ', $names );
		}
		$last = array_pop( $names );
		return implode( ', ', $names ) . ' and ' . $last;
	}

	private static function send( $phone, $text, $who, $profile_id ) {
		$settings = Family_Hub_Store::settings();
		if ( empty( $settings['sms_enabled'] ) || '' === $text ) {
			return;
		}
		$result = self::send_sms( $phone, $text );
		Family_Hub_Store::log_event(
			is_wp_error( $result ) ? 'sms_failed' : 'sms_sent',
			is_wp_error( $result ) ? 'Text to ' . $who . ' failed: ' . $result->get_error_message() : 'Texted ' . $who . ': "' . $text . '"',
			array( 'source' => 'sms', 'profile_id' => $profile_id )
		);
	}

	public static function api_key() {
		if ( defined( 'FAMILY_HUB_BREVO_API_KEY' ) && FAMILY_HUB_BREVO_API_KEY ) {
			return FAMILY_HUB_BREVO_API_KEY;
		}
		return (string) get_option( self::OPT_API_KEY, '' );
	}

	/** Send one SMS through Brevo. Returns true or WP_Error. */
	public static function send_sms( $phone, $text ) {
		/** Short-circuit sending (tests, or another SMS provider). Return true or WP_Error. */
		$pre = apply_filters( 'family_hub_pre_send_sms', null, $phone, $text );
		if ( null !== $pre ) {
			return $pre;
		}
		$key = self::api_key();
		if ( '' === $key ) {
			return new WP_Error( 'no_key', 'Brevo API key is not set' );
		}
		$settings = Family_Hub_Store::settings();
		$body     = array(
			'recipient' => ltrim( $phone, '+' ),
			'content'   => $text,
			'type'      => 'transactional',
			'tag'       => 'family-hub',
		);
		if ( '' !== $settings['sms_sender'] ) {
			$body['sender'] = $settings['sms_sender'];
		}
		$response = wp_remote_post(
			apply_filters( 'family_hub_brevo_sms_endpoint', 'https://api.brevo.com/v3/transactionalSMS/sms' ),
			array(
				'timeout' => 10,
				'headers' => array(
					'api-key'      => $key,
					'Content-Type' => 'application/json',
					'Accept'       => 'application/json',
				),
				'body'    => wp_json_encode( $body ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$code = wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) {
			$data = json_decode( wp_remote_retrieve_body( $response ), true );
			$msg  = is_array( $data ) && isset( $data['message'] ) ? $data['message'] : 'HTTP ' . $code;
			return new WP_Error( 'brevo', 'Brevo: ' . $msg );
		}
		return true;
	}

	/** Normalize to +E.164. 10-digit numbers are treated as US. */
	public static function normalize_phone( $raw ) {
		if ( ! is_string( $raw ) || '' === trim( $raw ) ) {
			return '';
		}
		$plus   = 0 === strpos( trim( $raw ), '+' );
		$digits = preg_replace( '/\D/', '', $raw );
		if ( ! $plus && 10 === strlen( $digits ) ) {
			$digits = '1' . $digits;
		}
		return strlen( $digits ) >= 8 && strlen( $digits ) <= 15 ? '+' . $digits : null;
	}
}
