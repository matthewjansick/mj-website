<?php
/**
 * Standalone app shell served at /python. Loaded outside the theme on purpose.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
$course = pycourse_course();
$index  = pycourse_lesson_index();
foreach ( $course['sections'] as &$sec ) {
	foreach ( $sec['lessons'] as &$l ) {
		$l['exerciseIds'] = isset( $index[ $l['id'] ] ) ? $index[ $l['id'] ]['exercises'] : array();
		$l['exercises']   = count( $l['exerciseIds'] );
	}
}
unset( $sec, $l );
$name   = isset( $course['title'] ) ? $course['title'] : 'Learn Python';
$ver    = PYCOURSE_VERSION . '.' . max( (int) filemtime( PYCOURSE_DIR . 'assets/app.js' ), (int) filemtime( PYCOURSE_DIR . 'assets/app.css' ), (int) filemtime( PYCOURSE_DIR . 'assets/worker.js' ) );
$pyo    = apply_filters( 'pycourse_pyodide_base', 'https://cdn.jsdelivr.net/pyodide/v' . PYCOURSE_PYODIDE_VERSION . '/full/' );
$cm     = apply_filters( 'pycourse_codemirror_base', 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/' . PYCOURSE_CODEMIRROR_VERSION . '/' );
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?php echo esc_html( $name ); ?></title>
<meta name="description" content="<?php echo esc_attr( isset( $course['tagline'] ) ? $course['tagline'] : $name ); ?>">
<meta name="theme-color" content="#1f5f8b">
<link rel="icon" href="<?php echo esc_url( PYCOURSE_URL . 'assets/icon.svg' ); ?>" type="image/svg+xml">
<link rel="apple-touch-icon" href="<?php echo esc_url( PYCOURSE_URL . 'assets/icon-180.png' ); ?>">
<link rel="stylesheet" href="<?php echo esc_url( $cm . 'codemirror.min.css' ); ?>" crossorigin="anonymous">
<link rel="stylesheet" href="<?php echo esc_url( PYCOURSE_URL . 'assets/app.css?v=' . $ver ); ?>">
</head>
<body>
<div id="app" class="app">
	<header class="topbar">
		<button class="iconbtn" id="menuBtn" type="button" aria-label="Lessons" aria-expanded="false"><span class="burger" aria-hidden="true"></span></button>
		<a class="brand" href="<?php echo esc_url( home_url( '/' . PYCOURSE_SLUG . '/' ) ); ?>" id="brandLink"><span class="brand-logo" aria-hidden="true">&gt;_</span> <?php echo esc_html( $name ); ?></a>
		<div class="topbar-right">
			<span class="engine" id="engineStatus" title="Python engine status"><span class="dot"></span><span class="engine-text">Starting Python…</span></span>
			<button class="whoami" id="whoBtn" type="button" title="Switch learner"></button>
		</div>
	</header>
	<div class="shell">
		<nav class="sidebar" id="sidebar" aria-label="Lessons"></nav>
		<div class="backdrop" id="backdrop" hidden></div>
		<main class="main" id="main"></main>
	</div>
	<div class="toast" id="toast" hidden></div>
	<div class="modal" id="modal" hidden></div>
</div>
<script>
window.PYCOURSE = {
	assets: <?php echo wp_json_encode( PYCOURSE_URL . 'assets/' ); ?>,
	lessonBase: <?php echo wp_json_encode( home_url( '/' . PYCOURSE_SLUG . '/lesson/' ) ); ?>,
	workerUrl: <?php echo wp_json_encode( home_url( '/' . PYCOURSE_SLUG . '/worker.js?v=' . $ver ) ); ?>,
	progressUrl: <?php echo wp_json_encode( rest_url( 'pycourse/v1/progress' ) ); ?>,
	pyodideBase: <?php echo wp_json_encode( $pyo ); ?>,
	codemirrorBase: <?php echo wp_json_encode( $cm ); ?>,
	version: <?php echo wp_json_encode( $ver ); ?>,
	course: <?php echo wp_json_encode( $course ); ?>
};
</script>
<script src="<?php echo esc_url( $cm . 'codemirror.min.js' ); ?>" crossorigin="anonymous"></script>
<script src="<?php echo esc_url( $cm . 'mode/python/python.min.js' ); ?>" crossorigin="anonymous"></script>
<script src="<?php echo esc_url( $cm . 'addon/edit/closebrackets.min.js' ); ?>" crossorigin="anonymous"></script>
<script src="<?php echo esc_url( $cm . 'addon/edit/matchbrackets.min.js' ); ?>" crossorigin="anonymous"></script>
<script src="<?php echo esc_url( $cm . 'addon/comment/comment.min.js' ); ?>" crossorigin="anonymous"></script>
<script src="<?php echo esc_url( PYCOURSE_URL . 'assets/app.js?v=' . $ver ); ?>"></script>
</body>
</html>
