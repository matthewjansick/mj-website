<?php
/**
 * Kid-facing "+5 more minutes" page (linked from the warning text).
 *
 * @package FamilyHub
 * @var array  $result
 * @var string $time
 * @var string $name
 */

defined( 'ABSPATH' ) || exit;

$status = $result['status'];
$copy   = array(
	'ok'       => array( 'Need a few more minutes?', $name ? "Screens go off at {$time}. You can add 5 minutes once." : '' ),
	'extended' => array( 'Done: 5 more minutes', "Screens now go off at {$time}." ),
	'used'     => array( 'Already used', "You already added 5 minutes. Screens go off at {$time}." ),
	'expired'  => array( 'This link has expired', 'It only works before screens go off.' ),
	'busy'     => array( 'One moment…', 'That didn’t go through. Try again.' ),
);
list( $title, $body ) = isset( $copy[ $status ] ) ? $copy[ $status ] : $copy['expired'];
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Family Hub</title>
<style>
:root { --bg: #f4f6f8; --card: #fff; --ink: #111a22; --ink-2: #4b5966; --primary: #1d6fe0; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg: #0c1218; --card: #151d25; --ink: #e8edf2; --ink-2: #a7b3bf; --primary: #4a90f0; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: var(--bg); color: var(--ink); font: 17px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 16px; box-sizing: border-box; }
main { background: var(--card); border-radius: 20px; padding: 28px 24px; max-width: 380px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
h1 { font-size: 24px; margin: 0 0 8px; }
p { color: var(--ink-2); margin: 0 0 20px; }
button { width: 100%; min-height: 54px; border: 0; border-radius: 14px; background: var(--primary); color: #fff; font-family: inherit; font-size: 18px; font-weight: 600; cursor: pointer; }
.big { font-size: 44px; margin-bottom: 8px; }
</style>
</head>
<body>
<main>
	<div class="big" aria-hidden="true"><?php echo 'extended' === $status ? '👍' : ( 'ok' === $status ? '⏳' : '🌙' ); ?></div>
	<h1><?php echo esc_html( $title ); ?></h1>
	<?php if ( $body ) : ?><p><?php echo esc_html( $body ); ?></p><?php endif; ?>
	<?php if ( 'ok' === $status || 'busy' === $status ) : ?>
	<form method="post"><button type="submit">Add 5 minutes</button></form>
	<?php endif; ?>
</main>
</body>
</html>
