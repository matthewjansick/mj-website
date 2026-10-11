<?php
// Wind-down / SMS test. Run against a dev site: wp eval-file family-hub/wordpress/tests/notify-test.php
// It wipes Family Hub profiles and settings, so never run it on the live site.
// Captures texts instead of calling Brevo, then walks a wind-down through time.
$GLOBALS['sent'] = array();
add_filter( 'family_hub_pre_send_sms', function ( $pre, $phone, $text ) { $GLOBALS['sent'][] = array( $phone, $text ); return true; }, 10, 3 );
wp_set_current_user( 1 );
$GLOBALS['fails'] = 0;
function check( $cond, $label ) { echo ( $cond ? "  ok   " : "  FAIL " ) . $label . "\n"; if ( ! $cond ) { $GLOBALS['fails']++; } }
function texts() { $t = $GLOBALS['sent']; $GLOBALS['sent'] = array(); return $t; }
function req( $method, $path, $body = null ) {
	$r = new WP_REST_Request( $method, '/family-hub/v1/' . $path );
	if ( $body ) { $r->set_header( 'content-type', 'application/json' ); $r->set_body( wp_json_encode( $body ) ); }
	$res = rest_do_request( $r );
	return $res->get_data();
}
function agent_applied( $map ) { $a = Family_Hub_Store::agent(); $a['applied'] = $map; $a['last_seen'] = time(); Family_Hub_Store::save_agent( $a ); }

delete_option( Family_Hub_Notify::OPT_STATE );
Family_Hub_Store::save_profiles( array() );
agent_applied( array() );
$s = req( 'POST', 'settings', array( 'sms_enabled' => true, 'sms_prefix' => 'Mom & Dad', 'warn_minutes' => array( 1, 15, 5 ), 'winddown_bedtime' => true,
	'parents' => array( array( 'name' => 'Matthew', 'phone' => '(404) 555-0101' ), array( 'name' => 'Co-parent', 'phone' => '+1 404 555 0102' ) ) ) );
check( $s['settings']['warn_minutes'] === array( 15, 5, 1 ), 'warning marks sorted' );
check( $s['settings']['parents'][0]['phone'] === '+14045550101', 'US phone normalized to E.164' );
check( $s['settings']['enforcement'] === 'traffic_rule', 'default enforcement is traffic rules' );
$bad = req( 'POST', 'profiles', array( 'name' => 'X', 'phone' => '12' ) );
check( isset( $bad['code'] ) && 'invalid' === $bad['code'], 'bad kid phone rejected' );

$s   = req( 'POST', 'profiles', array( 'name' => 'Ava', 'phone' => '404-555-0110', 'devices' => array( array( 'mac' => '00:11:22:33:44:01' ) ) ) );
$ava = $s['profiles'][0]['id'];
$s   = req( 'POST', 'profiles', array( 'name' => 'Liam', 'phone' => '404-555-0111', 'devices' => array( array( 'mac' => '00:11:22:33:44:05' ) ) ) );
$liam = $s['profiles'][1]['id'];

echo "\n== Wind down Ava, 15 minutes ==\n";
$t0 = time();
$s  = req( 'POST', "profiles/$ava/override", array( 'mode' => 'winddown', 'delay' => 15 ) );
check( false === $s['profiles'][0]['status']['blocked'], 'still online during wind-down' );
check( $s['profiles'][0]['cutoff']['source'] === 'winddown', 'dashboard sees the wind-down' );
Family_Hub_Notify::tick( $t0 );
$t = texts();
check( 1 === count( $t ) && '+14045550110' === $t[0][0], 'one text, to Ava' );
echo '        "' . $t[0][1] . "\"\n";
check( false !== strpos( $t[0][1], '15 min' ) && false !== strpos( $t[0][1], '/family/more/' ), 'says 15 min and has the +5 link' );
Family_Hub_Notify::tick( $t0 + 60 );
check( ! texts(), 'nothing new a minute later (no duplicates)' );

echo "\n== Ava taps +5 ==\n";
$state = Family_Hub_Notify::state();
$token = $state[ $ava ]['token'];
$r     = Family_Hub_Notify::use_token( $token );
check( 'extended' === $r['status'] && $r['target'] === $t0 + 20 * 60, 'cutoff moved to T+20' );
$t = texts();
check( 3 === count( $t ), 'confirmation to Ava + both parents' );
foreach ( $t as $x ) { echo '        ' . $x[0] . ' "' . $x[1] . "\"\n"; }
check( 'used' === Family_Hub_Notify::use_token( $token )['status'], 'second tap is refused' );
Family_Hub_Notify::tick( $t0 + 61 );
check( ! texts(), 'no catch-up warning after extending' );
Family_Hub_Notify::tick( $t0 + 15 * 60 );
$t = texts();
check( 1 === count( $t ) && false !== strpos( $t[0][1], '5 min' ) && false === strpos( $t[0][1], '/more/' ), '5-min warning, without the +5 link' );
Family_Hub_Notify::tick( $t0 + 19 * 60 );
$t = texts();
check( 1 === count( $t ) && false !== strpos( $t[0][1], '1 minute' ), '1-min warning' );
echo '        "' . $t[0][1] . "\"\n";

echo "\n== Cutoff ==\n";
Family_Hub_Notify::tick( $t0 + 20 * 60 );
$t = texts();
check( 1 === count( $t ) && false !== strpos( $t[0][1], 'off now' ), 'kid told screens are off' );
Family_Hub_Notify::tick( $t0 + 20 * 60 + 10 );
check( ! texts(), 'parents wait until the agent confirms' );
agent_applied( array( '00:11:22:33:44:01' => true ) );
Family_Hub_Notify::tick( $t0 + 20 * 60 + 20 );
$t = texts();
check( 2 === count( $t ) && false !== strpos( $t[0][1], 'Ava offline now' ), 'both parents told once the router confirms' );
echo '        "' . $t[0][1] . "\"\n";
Family_Hub_Notify::tick( $t0 + 20 * 60 + 30 );
check( ! texts(), 'no repeat' );

echo "\n== Liam: wind-down cancelled ==\n";
req( 'POST', "profiles/$liam/override", array( 'mode' => 'winddown', 'delay' => 10 ) );
Family_Hub_Notify::tick( $t0 );
$t = texts();
check( 1 === count( $t ) && false !== strpos( $t[0][1], '10 min' ), 'starts at the 10-min mark (catch-up, one text)' );
req( 'POST', "profiles/$liam/override", array( 'mode' => 'clear' ) );
Family_Hub_Notify::tick( $t0 + 30 );
$t = texts();
check( 1 === count( $t ) && false !== strpos( $t[0][1], 'Never mind' ), 'kid told it was cancelled' );

echo "\n== Liam: parent gives +5 during a wind-down ==\n";
req( 'POST', "profiles/$liam/override", array( 'mode' => 'winddown', 'delay' => 5 ) );
Family_Hub_Notify::tick( time() );
texts();
req( 'POST', "profiles/$liam/override", array( 'mode' => 'postpone', 'minutes' => 5 ) );
Family_Hub_Notify::tick( time() + 1 );
$t = texts();
check( 1 === count( $t ) && false !== strpos( $t[0][1], 'Change of plans' ), 'kid told the new time' );
req( 'POST', "profiles/$liam/override", array( 'mode' => 'clear' ) );
Family_Hub_Notify::tick( time() + 2 );
texts();

echo "\n== Bedtime from the schedule ==\n";
$p          = Family_Hub_Store::profile( $liam );
$start      = ( new DateTimeImmutable( '@' . ( time() + 12 * 60 ) ) )->setTimezone( wp_timezone() );
$end        = $start->modify( '+8 hours' );
$p['schedule'] = array( array( 'days' => array( 0, 1, 2, 3, 4, 5, 6 ), 'start' => $start->format( 'H:i' ), 'end' => $end->format( 'H:i' ) ) );
Family_Hub_Store::put_profile( $p );
$bed = Family_Hub_Notify::next_cutoff( $p, time() );
check( $bed && 'bedtime' === $bed['source'], 'bedtime cutoff found' );
Family_Hub_Notify::tick( time() + 5 );
$t = texts();
check( 1 === count( $t ) && false !== strpos( $t[0][1], $start->format( 'g:i' ) ), 'bedtime warning mentions the time' );
echo '        "' . $t[0][1] . "\"\n";
$token = Family_Hub_Notify::state()[ $liam ]['token'];
$r     = Family_Hub_Notify::use_token( $token );
check( 'extended' === $r['status'] && abs( $r['target'] - ( $bed['at'] + 300 ) ) < 2, '+5 on bedtime moves it 5 minutes' );
texts();

echo "\n== Turning bedtime warnings off ==\n";
req( 'POST', "profiles/$liam/override", array( 'mode' => 'clear' ) );
delete_option( Family_Hub_Notify::OPT_STATE );
req( 'POST', 'settings', array( 'winddown_bedtime' => false ) );
Family_Hub_Notify::tick( time() + 10 );
check( ! texts(), 'no bedtime texts when the setting is off' );

echo "\n== Texts off ==\n";
req( 'POST', 'settings', array( 'sms_enabled' => false, 'winddown_bedtime' => true ) );
req( 'POST', "profiles/$ava/override", array( 'mode' => 'winddown', 'delay' => 15 ) );
Family_Hub_Notify::tick( time() + 20 );
check( ! texts(), 'nothing sent with texts switched off' );

echo $GLOBALS['fails'] ? "\n" . $GLOBALS['fails'] . " FAILED\n" : "\nALL PASSED\n";
