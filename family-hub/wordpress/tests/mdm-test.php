<?php
// Apple device (MDM) reporting / lock test. Dev site only: wp eval-file family-hub/wordpress/tests/mdm-test.php
// It wipes Family Hub profiles and rotates the agent token, so never run it on the live site.
wp_set_current_user( 1 );
$GLOBALS['fails'] = 0;
function check( $c, $l ) { echo ( $c ? "  ok   " : "  FAIL " ) . $l . "\n"; if ( ! $c ) { $GLOBALS['fails']++; } }
function req( $m, $path, $body = null, $headers = array() ) {
	$r = new WP_REST_Request( $m, '/family-hub/v1/' . $path );
	if ( null !== $body ) { $r->set_header( 'content-type', 'application/json' ); $r->set_body( wp_json_encode( $body ) ); }
	foreach ( $headers as $k => $v ) { $r->set_header( $k, $v ); }
	return rest_do_request( $r )->get_data();
}
Family_Hub_Store::save_profiles( array() );
delete_option( 'family_hub_mdm' );
$token = Family_Hub_Store::rotate_token();
$s   = req( 'POST', 'profiles', array( 'name' => 'Ava', 'devices' => array( array( 'mac' => 'a4:83:e7:12:34:56' ), array( 'mac' => '00:11:22:33:44:02' ) ) ) );
$ava = $s['profiles'][0]['id'];

$sync = req( 'POST', 'agent/sync', array(
	'agent_version' => '0.3.0', 'applied' => array(), 'events' => array(),
	'mdm' => array( 'ok' => true, 'topic' => 'com.apple.mgmt.External.x', 'push_cert_expires' => '2027-10-01T00:00:00Z',
		'devices' => array(
			array( 'udid' => '00008110-001A2B3C4D5E801E', 'name' => "Ava's iPhone <script>", 'os' => '18.6', 'wifi_mac' => 'A4:83:E7:12:34:56', 'supervised' => true, 'enrolled' => true, 'downtime' => false, 'locked' => false ),
			array( 'udid' => 'bad udid!', 'name' => 'x' ),
		) ),
), array( 'x_family_hub_token' => $token ) );
check( isset( $sync['config']['mdm']['downtime_apps'] ) && in_array( 'com.apple.MobileSMS', $sync['config']['mdm']['downtime_apps'], true ), 'agent gets downtime apps' );
check( false === $sync['config']['profiles'][0]['lock'], 'agent sees lock=false' );
$mdm = Family_Hub_Store::mdm();
check( 1 === count( $mdm['devices'] ), 'invalid device dropped' );
check( 'a4:83:e7:12:34:56' === $mdm['devices'][0]['wifi_mac'], 'MAC normalized' );
check( false === strpos( $mdm['devices'][0]['name'], '<script>' ), 'device name sanitized' );

$st  = req( 'GET', 'state' );
$dev = $st['profiles'][0]['devices'][0];
check( $dev['mdm'] && 'Ava\'s iPhone' === trim( $dev['mdm']['name'] ), 'device matched to Ava by Wi-Fi MAC' );
check( null === $st['profiles'][0]['devices'][1]['mdm'], 'Xbox has no MDM' );

// Wind down now: phone should show as pending until MDM confirms
req( 'POST', "profiles/$ava/override", array( 'mode' => 'block' ) );
$st = req( 'GET', 'state' );
check( true === $st['profiles'][0]['pending'], 'pending while phone not yet locked down' );

// Agent reports downtime applied + router applied for the Xbox
req( 'POST', 'agent/sync', array( 'agent_version' => '0.3.0', 'events' => array(),
	'applied' => array( '00:11:22:33:44:02' => true ),
	'mdm' => array( 'ok' => true, 'devices' => array( array( 'udid' => '00008110-001A2B3C4D5E801E', 'name' => 'Ava iPhone', 'wifi_mac' => 'a4:83:e7:12:34:56', 'enrolled' => true, 'downtime' => true, 'locked' => false ) ) ),
), array( 'x_family_hub_token' => $token ) );
$st = req( 'GET', 'state' );
check( false === $st['profiles'][0]['pending'], 'no longer pending: phone off-network but downtime applied' );

// Lock completely
$st = req( 'POST', "profiles/$ava/lock", array( 'locked' => true ) );
check( true === $st['profiles'][0]['lock'], 'lock saved' );
$cfg = req( 'POST', 'agent/sync', array( 'events' => array() ), array( 'x_family_hub_token' => $token ) );
check( true === $cfg['config']['profiles'][0]['lock'], 'agent told to lock' );
req( 'PUT', "profiles/$ava", array( 'name' => 'Ava B', 'devices' => array( array( 'mac' => 'a4:83:e7:12:34:56' ) ) ) );
check( ! empty( Family_Hub_Store::profile( $ava )['lock'] ), 'editing the profile keeps the lock' );

// Settings
$st = req( 'POST', 'settings', array( 'downtime_apps' => array( 'com.apple.MobileSMS', 'not valid!', 'com.duolingo.DuolingoMobile' ), 'lock_message' => 'Phones away <b>now</b>' ) );
check( array( 'com.apple.MobileSMS', 'com.duolingo.DuolingoMobile' ) === $st['settings']['downtime_apps'], 'bundle IDs validated' );
check( 'Phones away now' === $st['settings']['lock_message'], 'lock message sanitized' );
echo $GLOBALS['fails'] ? "\n" . $GLOBALS['fails'] . " FAILED\n" : "\nALL PASSED\n";
