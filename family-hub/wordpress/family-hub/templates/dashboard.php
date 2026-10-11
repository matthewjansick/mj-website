<?php
/**
 * Dashboard shell. Everything else is rendered by assets/app.js.
 *
 * @package FamilyHub
 * @var array $boot
 */

defined( 'ABSPATH' ) || exit;
$ver = FAMILY_HUB_VERSION . '.' . filemtime( FAMILY_HUB_DIR . 'assets/app.js' );
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0f1720" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f4f6f8" media="(prefers-color-scheme: light)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Family Hub">
<title>Family Hub</title>
<link rel="stylesheet" href="<?php echo esc_url( FAMILY_HUB_URL . 'assets/app.css?ver=' . $ver ); ?>">
</head>
<body>
<div id="app" aria-live="polite"><p class="boot">Loading Family Hub…</p></div>
<script>window.FAMILY_HUB = <?php echo wp_json_encode( $boot ); ?>;</script>
<script src="<?php echo esc_url( FAMILY_HUB_URL . 'assets/app.js?ver=' . $ver ); ?>"></script>
</body>
</html>
