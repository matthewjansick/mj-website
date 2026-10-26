<?php
/**
 * Standalone app shell served at /anvil. Loaded outside the theme on purpose.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
$content = anvil_content();
$name    = isset( $content['app']['name'] ) ? $content['app']['name'] : 'Anvil';
$theme   = isset( $content['app']['theme'] ) ? $content['app']['theme'] : '#0a84ff';
$ver     = ANVIL_VERSION;
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title><?php echo esc_html( $name ); ?></title>
<meta name="description" content="<?php echo esc_attr( isset( $content['app']['tagline'] ) ? $content['app']['tagline'] : $name ); ?>">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="<?php echo esc_attr( $name ); ?>">
<meta name="theme-color" content="<?php echo esc_attr( $theme ); ?>">
<link rel="manifest" href="<?php echo esc_url( home_url( '/' . ANVIL_SLUG . '/manifest.webmanifest' ) ); ?>">
<link rel="apple-touch-icon" href="<?php echo esc_url( ANVIL_URL . 'assets/icon-512.png' ); ?>">
<link rel="icon" href="<?php echo esc_url( ANVIL_URL . 'assets/icon.svg' ); ?>" type="image/svg+xml">
<link rel="stylesheet" href="<?php echo esc_url( ANVIL_URL . 'assets/app.css?v=' . $ver ); ?>">
</head>
<body>
<div id="app" class="app" aria-live="polite">
	<header class="navbar" id="navbar">
		<button class="nav-back" id="navBack" type="button" hidden><span class="chev" aria-hidden="true"></span><span id="navBackLabel">Back</span></button>
		<h1 class="nav-title" id="navTitle"><?php echo esc_html( $name ); ?></h1>
	</header>
	<main class="screen-host" id="screenHost"></main>
	<nav class="tabbar" id="tabbar" aria-label="Sections"></nav>
	<div class="a2hs" id="a2hs" hidden>
		<div class="a2hs-card">
			<p><strong>Install <?php echo esc_html( $name ); ?></strong><br>Tap <span class="share-glyph" aria-label="Share"></span> then <b>Add to Home Screen</b>.</p>
			<button type="button" id="a2hsClose">Got it</button>
		</div>
	</div>
</div>
<script>
window.ANVIL = {
	contentUrl: <?php echo wp_json_encode( home_url( '/' . ANVIL_SLUG . '/content.json?v=' . $ver ) ); ?>,
	content: <?php echo wp_json_encode( $content ); ?>
};
</script>
<script src="<?php echo esc_url( ANVIL_URL . 'assets/app.js?v=' . $ver ); ?>"></script>
</body>
</html>
