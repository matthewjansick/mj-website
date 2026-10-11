<?php
/**
 * Schedule evaluation. Mirrors in_downtime()/profile_state() in the home agent,
 * which is what actually enforces it; this copy drives the dashboard.
 *
 * Days are 0=Sunday..6=Saturday. A rule whose end <= start runs past midnight
 * into the next day; start == end blocks the whole day.
 *
 * @package FamilyHub
 */

defined( 'ABSPATH' ) || exit;

final class Family_Hub_Schedule {

	private static function minutes( $hm ) {
		list( $h, $m ) = array_map( 'intval', explode( ':', $hm ) );
		return $h * 60 + $m;
	}

	public static function in_downtime( array $rules, DateTimeInterface $local ) {
		$day    = (int) $local->format( 'w' );
		$prev   = ( $day + 6 ) % 7;
		$minute = (int) $local->format( 'G' ) * 60 + (int) $local->format( 'i' );
		foreach ( $rules as $rule ) {
			$days  = array_map( 'intval', isset( $rule['days'] ) ? (array) $rule['days'] : array() );
			$start = self::minutes( $rule['start'] );
			$end   = self::minutes( $rule['end'] );
			if ( $start === $end ) {
				if ( in_array( $day, $days, true ) ) {
					return true;
				}
			} elseif ( $start < $end ) {
				if ( in_array( $day, $days, true ) && $minute >= $start && $minute < $end ) {
					return true;
				}
			} elseif ( ( in_array( $day, $days, true ) && $minute >= $start ) || ( in_array( $prev, $days, true ) && $minute < $end ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @return array{blocked: bool, reason: string, until: int|null}
	 *   reason: disabled | paused | bonus | downtime | open
	 *   until:  unix time the state is expected to change, or null if not scheduled to.
	 */
	public static function status( array $profile, $now = null, $used = false ) {
		$now = null === $now ? time() : (int) $now;
		if ( empty( $profile['enabled'] ) ) {
			return array( 'blocked' => false, 'reason' => 'disabled', 'until' => null );
		}
		$o = isset( $profile['override'] ) && is_array( $profile['override'] ) ? $profile['override'] : array();
		if ( self::override_active( $o, $now ) ) {
			return array(
				'blocked' => 'block' === $o['mode'],
				'reason'  => 'block' === $o['mode'] ? 'paused' : 'bonus',
				'until'   => isset( $o['until'] ) ? (int) $o['until'] : null,
			);
		}
		// Daily screen-time limit (usage comes from the home agent; unknown usage never blocks).
		$used  = false === $used ? Family_Hub_Store::usage_today( $profile['id'] ) : $used;
		$limit = self::daily_limit( $profile, self::local( $now ) );
		if ( null !== $limit && null !== $used && $used >= $limit ) {
			return array(
				'blocked' => true,
				'reason'  => 'limit',
				'until'   => self::local( $now )->modify( '+1 day' )->setTime( 0, 0 )->getTimestamp(),
			);
		}
		$rules   = isset( $profile['schedule'] ) ? (array) $profile['schedule'] : array();
		$blocked = self::in_downtime( $rules, self::local( $now ) );
		return array(
			'blocked' => $blocked,
			'reason'  => $blocked ? 'downtime' : 'open',
			'until'   => self::next_change( $rules, $now, $blocked ),
		);
	}

	/** Today's allowance in minutes (allowance is 7 values, Sunday first; null = no limit). */
	public static function daily_limit( array $profile, DateTimeInterface $local ) {
		$a   = isset( $profile['allowance'] ) && is_array( $profile['allowance'] ) ? $profile['allowance'] : array();
		$day = (int) $local->format( 'w' );
		return 7 === count( $a ) && null !== $a[ $day ] ? max( 0, (int) $a[ $day ] ) : null;
	}

	/** A wind-down is a block override whose start is still in the future. */
	public static function override_active( $o, $now ) {
		return is_array( $o ) && isset( $o['mode'] ) && in_array( $o['mode'], array( 'block', 'allow' ), true )
			&& ( empty( $o['start'] ) || (int) $o['start'] <= $now )
			&& ( empty( $o['until'] ) || (int) $o['until'] > $now );
	}

	/** Every rule start/end time from $from (exclusive) over the next $days days. */
	public static function boundaries( array $rules, $from, $days = 2 ) {
		$out   = array();
		$today = ( new DateTimeImmutable( '@' . $from ) )->setTimezone( wp_timezone() )->setTime( 0, 0 );
		for ( $d = -1; $d <= $days; $d++ ) {
			$date = $today->modify( ( $d >= 0 ? '+' : '' ) . $d . ' days' );
			foreach ( $rules as $rule ) {
				foreach ( array( $rule['start'], $rule['end'] ) as $hm ) {
					list( $h, $m ) = array_map( 'intval', explode( ':', $hm ) );
					$ts            = $date->setTime( $h, $m )->getTimestamp();
					if ( $ts > $from ) {
						$out[ $ts ] = true;
					}
				}
			}
		}
		ksort( $out );
		return array_keys( $out );
	}

	/** Next time (within 8 days) the schedule flips state, checked at rule boundaries. */
	public static function next_change( array $rules, $now, $blocked_now ) {
		if ( ! $rules ) {
			return null;
		}
		foreach ( self::boundaries( $rules, $now, 8 ) as $ts ) {
			if ( self::in_downtime( $rules, self::local( $ts ) ) !== $blocked_now ) {
				return $ts;
			}
		}
		return null;
	}

	public static function local( $ts ) {
		return ( new DateTimeImmutable( '@' . $ts ) )->setTimezone( wp_timezone() );
	}
}
