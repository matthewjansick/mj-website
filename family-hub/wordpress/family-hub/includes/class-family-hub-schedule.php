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
	public static function status( array $profile, $now = null ) {
		$now = null === $now ? time() : (int) $now;
		if ( empty( $profile['enabled'] ) ) {
			return array( 'blocked' => false, 'reason' => 'disabled', 'until' => null );
		}
		$o = isset( $profile['override'] ) && is_array( $profile['override'] ) ? $profile['override'] : array();
		if ( isset( $o['mode'] ) && in_array( $o['mode'], array( 'block', 'allow' ), true )
			&& ( ! isset( $o['until'] ) || null === $o['until'] || $o['until'] > $now ) ) {
			return array(
				'blocked' => 'block' === $o['mode'],
				'reason'  => 'block' === $o['mode'] ? 'paused' : 'bonus',
				'until'   => isset( $o['until'] ) ? (int) $o['until'] : null,
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

	/** Next time (within 8 days) the schedule flips state, checked at rule boundaries. */
	public static function next_change( array $rules, $now, $blocked_now ) {
		if ( ! $rules ) {
			return null;
		}
		$tz         = wp_timezone();
		$today      = ( new DateTimeImmutable( '@' . $now ) )->setTimezone( $tz )->setTime( 0, 0 );
		$candidates = array();
		for ( $d = -1; $d <= 8; $d++ ) {
			$date = $today->modify( ( $d >= 0 ? '+' : '' ) . $d . ' days' );
			foreach ( $rules as $rule ) {
				foreach ( array( $rule['start'], $rule['end'] ) as $hm ) {
					list( $h, $m ) = array_map( 'intval', explode( ':', $hm ) );
					$ts            = $date->setTime( $h, $m )->getTimestamp();
					if ( $ts > $now ) {
						$candidates[ $ts ] = true;
					}
				}
			}
		}
		ksort( $candidates );
		foreach ( array_keys( $candidates ) as $ts ) {
			if ( self::in_downtime( $rules, self::local( $ts ) ) !== $blocked_now ) {
				return $ts;
			}
		}
		return null;
	}

	private static function local( $ts ) {
		return ( new DateTimeImmutable( '@' . $ts ) )->setTimezone( wp_timezone() );
	}
}
