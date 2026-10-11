<?php
// Screen-time limit test. Dev site only: wp eval-file family-hub/wordpress/tests/limit-test.php
// It wipes Family Hub profiles, settings and usage, so never run it on the live site.
$GLOBALS['sent']  = array();
$GLOBALS['fails'] = 0;
add_filter( 'family_hub_pre_send_sms', function ( $pre, $phone, $text ) { $GLOBALS['sent'][] = $text; return true; }, 10, 3 );
wp_set_current_user( 1 );
function check( $c, $l ) { echo ( $c ? "  ok   " : "  FAIL " ) . $l . "\n"; if ( ! $c ) { $GLOBALS['fails']++; } }
function texts() { $t = $GLOBALS['sent']; $GLOBALS['sent'] = array(); return $t; }
function req( $m, $path, $body = null, $headers = array() ) {
	$r = new WP_REST_Request( $m, '/family-hub/v1/' . $path );
	if ( null !== $body ) { $r->set_header( 'content-type', 'application/json' ); $r->set_body( wp_json_encode( $body ) ); }
	foreach ( $headers as $k => $v ) { $r->set_header( $k, $v ); }
	return rest_do_request( $r )->get_data();
}
Family_Hub_Store::save_profiles( array() );
foreach ( array( 'family_hub_usage', 'family_hub_limit_state', 'family_hub_notify_state', 'family_hub_settings' ) as $o ) { delete_option( $o ); }
$GLOBALS['token'] = Family_Hub_Store::rotate_token();
function report( $minutes ) {

	return req( 'POST', 'agent/sync', array( 'events' => array(), 'usage' => array( 'day' => wp_date( 'Y-m-d' ), 'minutes' => $minutes ) ), array( 'x_family_hub_token' => $GLOBALS['token'] ) );
}
req( 'POST', 'settings', array( 'sms_enabled' => true, 'parents' => array( array( 'name' => 'Matthew', 'phone' => '4045550101' ) ) ) );
$s   = req( 'POST', 'profiles', array( 'name' => 'Ava', 'phone' => '4045550110', 'devices' => array( array( 'mac' => '00:11:22:33:44:01' ) ),
	'allowance' => array( 120, 120, 120, 120, 120, 120, 120 ) ) );
$ava = $s['profiles'][0]['id'];
check( array_fill( 0, 7, 120 ) === $s['profiles'][0]['allowance'], 'allowance saved' );
check( null === $s['profiles'][0]['usage']['today'], 'usage unknown before the agent reports' );
check( 'open' === $s['profiles'][0]['status']['reason'], 'unknown usage never blocks' );

$cfg = report( array( $ava => 90 ) );
check( array_fill( 0, 7, 120 ) === $cfg['config']['profiles'][0]['allowance'], 'agent receives the allowance' );
check( 250 === $cfg['config']['usage_threshold_kb'], 'agent receives the threshold' );
Family_Hub_Notify::tick();
check( ! texts(), 'no text with 30 min left' );
report( array( $ava => 106 ) );
Family_Hub_Notify::tick();
$t = texts();
check( 1 === count( $t ) && false !== strpos( $t[0], '14 min of screen time left' ), 'warning at the 15-min mark' );
echo '        "' . ( $t ? $t[0] : '' ) . "\"\n";
Family_Hub_Notify::tick();
check( ! texts(), 'no repeat' );
report( array( $ava => 119 ) );
Family_Hub_Notify::tick();
$t = texts();
check( 1 === count( $t ) && false !== strpos( $t[0], '1 min' ), 'one text when 5 and 1 pass together' );

report( array( $ava => 120 ) );
$st = req( 'GET', 'state' );
check( 'limit' === $st['profiles'][0]['status']['reason'] && $st['profiles'][0]['status']['blocked'], 'blocked: daily limit reached' );
check( 120 === $st['profiles'][0]['usage']['today'] && 120 === $st['profiles'][0]['usage']['limit'], 'dashboard sees usage and limit' );
Family_Hub_Notify::tick();
$t = texts();
check( 1 === count( $t ) && false !== strpos( $t[0], 'all your screen time for today' ), 'limit cutoff text' );

req( 'POST', "profiles/$ava/override", array( 'mode' => 'allow', 'minutes' => 30 ) );
$st = req( 'GET', 'state' );
check( 'bonus' === $st['profiles'][0]['status']['reason'], 'bonus time beats the limit' );

$s = req( 'PUT', "profiles/$ava", array( 'name' => 'Ava', 'devices' => array(), 'allowance' => array( null, null, null, null, null, null, null ) ) );
check( null === $s['profiles'][0]['allowance'], 'all-empty allowance means no limit' );
$s = req( 'PUT', "profiles/$ava", array( 'name' => 'Ava', 'devices' => array(), 'allowance' => array( 180, 120, 120, 120, 120, 120, 180 ) ) );
req( 'POST', "profiles/$ava/override", array( 'mode' => 'clear' ) );

// A new day: yesterday moves to history, today starts at 0.
$u            = Family_Hub_Store::usage();
$u['day']     = wp_date( 'Y-m-d', time() - DAY_IN_SECONDS );
update_option( 'family_hub_usage', $u, false );
check( 0 === Family_Hub_Store::usage_today( $ava ), 'stale day reads as 0 (new day)' );
report( array( $ava => 5 ) );
$st   = req( 'GET', 'state' );
$week = $st['profiles'][0]['usage']['week'];
check( 120 === $week[5]['minutes'] && 5 === $week[6]['minutes'], 'history keeps yesterday' );
// Weekly summary: Sunday 7 PM, once, only near the slot. Seed a known week before the last Sunday.
delete_option( 'family_hub_weekly_sent' );
$local  = Family_Hub_Schedule::local( time() );
$sunday = $local->modify( '-' . (int) $local->format( 'w' ) . ' days' )->setTime( 19, 5 );
if ( $sunday->getTimestamp() > time() ) { $sunday = $sunday->modify( '-7 days' ); }
$u = Family_Hub_Store::usage();
for ( $i = 0; $i < 7; $i++ ) {
	$u['history'][ wp_date( 'Y-m-d', $sunday->getTimestamp() - $i * DAY_IN_SECONDS ) ] = array( $ava => 3 === $i ? 200 : 60 );
}
update_option( 'family_hub_usage', $u, false );
$sum = Family_Hub_Notify::weekly_summary( $sunday->getTimestamp() );
check( 'Family Hub week: Ava 9h 20m (avg 1h 20m/day, limit reached 1 day).' === $sum, 'weekly summary text' );
echo '        "' . $sum . "\"\n";
texts();
Family_Hub_Notify::tick( $sunday->getTimestamp() - 600 );
check( ! array_filter( texts(), function ( $t ) { return 0 === strpos( $t, 'Family Hub week' ); } ), 'not before Sunday 7 PM' );
Family_Hub_Notify::tick( $sunday->getTimestamp() );
check( 1 === count( array_filter( texts(), function ( $t ) { return 0 === strpos( $t, 'Family Hub week' ); } ) ), 'sent at Sunday 7 PM (one parent)' );
Family_Hub_Notify::tick( $sunday->getTimestamp() + 600 );
check( ! array_filter( texts(), function ( $t ) { return 0 === strpos( $t, 'Family Hub week' ); } ), 'only once' );
delete_option( 'family_hub_weekly_sent' );
Family_Hub_Notify::tick( $sunday->getTimestamp() + 8 * HOUR_IN_SECONDS );
check( ! array_filter( texts(), function ( $t ) { return 0 === strpos( $t, 'Family Hub week' ); } ), 'not sent late (fresh install on Monday)' );
$prev = req( 'GET', 'report/weekly' );
check( $prev['text'] === Family_Hub_Notify::weekly_summary( time() ), 'dashboard preview matches' );

echo $GLOBALS['fails'] ? "\n" . $GLOBALS['fails'] . " FAILED\n" : "\nALL PASSED\n";
