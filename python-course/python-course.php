<?php
/**
 * Plugin Name: Python Course
 * Plugin URI:  https://jansick.com/python
 * Description: An introductory Python course that runs real Python in the browser at /python, with progress saved per email address.
 * Version:     1.0.0
 * Author:      Matthew Jansick
 * License:     GPL-2.0-or-later
 * Text Domain: python-course
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'PYCOURSE_VERSION', '1.0.0' );
define( 'PYCOURSE_SLUG', 'python' );
define( 'PYCOURSE_DIR', plugin_dir_path( __FILE__ ) );
define( 'PYCOURSE_URL', plugin_dir_url( __FILE__ ) );

/* Pinned CDN versions. Override with the filters below if you ever need to bump them. */
define( 'PYCOURSE_PYODIDE_VERSION', '0.27.7' );
define( 'PYCOURSE_CODEMIRROR_VERSION', '5.65.18' );

define( 'PYCOURSE_MAX_LEARNER_BYTES', 400 * 1024 );

/* ------------------------------------------------------------------------
 * Routes: /python (the app), /python/lesson/<id> (lesson text), /python/worker.js (the Python engine worker)
 * --------------------------------------------------------------------- */

function pycourse_add_rewrite_rules() {
	add_rewrite_rule( '^' . PYCOURSE_SLUG . '/?$', 'index.php?pycourse_route=app', 'top' );
	add_rewrite_rule( '^' . PYCOURSE_SLUG . '/lesson/([a-z0-9\-]+)/?$', 'index.php?pycourse_route=lesson&pycourse_lesson=$matches[1]', 'top' );
	add_rewrite_rule( '^' . PYCOURSE_SLUG . '/worker\.js$', 'index.php?pycourse_route=worker', 'top' );
}
add_action( 'init', 'pycourse_add_rewrite_rules' );

function pycourse_query_vars( $vars ) {
	$vars[] = 'pycourse_route';
	$vars[] = 'pycourse_lesson';
	return $vars;
}
add_filter( 'query_vars', 'pycourse_query_vars' );

function pycourse_activate() {
	pycourse_add_rewrite_rules();
	flush_rewrite_rules();
	pycourse_schedule_summary();
}
register_activation_hook( __FILE__, 'pycourse_activate' );

function pycourse_deactivate() {
	flush_rewrite_rules();
	wp_clear_scheduled_hook( 'pycourse_weekly_summary' );
}
register_deactivation_hook( __FILE__, 'pycourse_deactivate' );

/**
 * Serve the requested route and stop WordPress from loading the theme.
 */
function pycourse_template_redirect() {
	$route = get_query_var( 'pycourse_route' );
	if ( ! $route ) {
		return;
	}

	switch ( $route ) {
		case 'lesson':
			$id   = sanitize_key( get_query_var( 'pycourse_lesson' ) );
			$file = pycourse_lesson_file( $id );
			if ( ! $file ) {
				status_header( 404 );
				header( 'Content-Type: text/plain; charset=utf-8' );
				echo 'No such lesson.';
				exit;
			}
			status_header( 200 );
			header( 'Content-Type: text/markdown; charset=utf-8' );
			header( 'Cache-Control: public, max-age=300' );
			readfile( $file );
			exit;

		case 'worker':
			/*
			 * A dedicated worker on a cross-origin-isolated page must itself be
			 * served with COEP, which a plain static file would not be.
			 */
			status_header( 200 );
			header( 'Content-Type: text/javascript; charset=utf-8' );
			header( 'Cache-Control: public, max-age=3600' );
			header( 'Cross-Origin-Embedder-Policy: require-corp' );
			header( 'Cross-Origin-Resource-Policy: same-origin' );
			readfile( PYCOURSE_DIR . 'assets/worker.js' );
			exit;

		case 'app':
		default:
			nocache_headers();
			status_header( 200 );
			header( 'Content-Type: text/html; charset=utf-8' );
			/*
			 * Cross-origin isolation lets the Python worker block on input()
			 * with SharedArrayBuffer + Atomics. Everything the page loads is
			 * either same-origin or fetched with CORS from a CDN that sends
			 * Access-Control-Allow-Origin: *, so require-corp is safe here.
			 */
			header( 'Cross-Origin-Opener-Policy: same-origin' );
			header( 'Cross-Origin-Embedder-Policy: require-corp' );
			include PYCOURSE_DIR . 'app.php';
			exit;
	}
}
add_action( 'template_redirect', 'pycourse_template_redirect' );

/* ------------------------------------------------------------------------
 * Course structure
 * --------------------------------------------------------------------- */

function pycourse_course() {
	static $cache = null;
	if ( null === $cache ) {
		$raw   = file_get_contents( PYCOURSE_DIR . 'assets/course.json' );
		$cache = json_decode( $raw, true );
		if ( ! is_array( $cache ) ) {
			$cache = array( 'title' => 'Python', 'sections' => array() );
		}
	}
	return $cache;
}

function pycourse_lesson_file( $id ) {
	if ( ! preg_match( '/^[a-z0-9\-]+$/', $id ) ) {
		return false;
	}
	$file = PYCOURSE_DIR . 'assets/lessons/' . $id . '.md';
	return file_exists( $file ) ? $file : false;
}

/**
 * Flat list of lessons with their exercise ids, read from the lesson files.
 * Used by the admin page to compute totals without trusting the client.
 */
function pycourse_lesson_index() {
	static $cache = null;
	if ( null !== $cache ) {
		return $cache;
	}
	$cache  = array();
	$course = pycourse_course();
	foreach ( $course['sections'] as $section ) {
		foreach ( $section['lessons'] as $lesson ) {
			$id   = $lesson['id'];
			$file = pycourse_lesson_file( $id );
			$exs  = array();
			if ( $file ) {
				$text = file_get_contents( $file );
				if ( preg_match_all( '/^:::\s*exercise\s+id=([a-z0-9\-_]+)/m', $text, $m ) ) {
					$exs = $m[1];
				}
			}
			$cache[ $id ] = array(
				'id'        => $id,
				'title'     => $lesson['title'],
				'section'   => $section['title'],
				'exercises' => $exs,
			);
		}
	}
	return $cache;
}

/* ------------------------------------------------------------------------
 * Progress storage. One option per learner (not autoloaded) plus an index.
 * --------------------------------------------------------------------- */

function pycourse_learner_key( $email ) {
	return 'pycourse_learner_' . md5( strtolower( trim( $email ) ) );
}

function pycourse_learner_index() {
	$index = get_option( 'pycourse_learners', array() );
	return is_array( $index ) ? $index : array();
}

function pycourse_get_learner( $email ) {
	$data = get_option( pycourse_learner_key( $email ), null );
	return is_array( $data ) ? $data : null;
}

function pycourse_put_learner( $email, $data ) {
	$email = strtolower( trim( $email ) );
	update_option( pycourse_learner_key( $email ), $data, false );
	$index = pycourse_learner_index();
	$index[ $email ] = array(
		'name'       => isset( $data['name'] ) ? $data['name'] : '',
		'lastActive' => isset( $data['lastActive'] ) ? (int) $data['lastActive'] : time() * 1000,
	);
	update_option( 'pycourse_learners', $index, false );
}

function pycourse_delete_learner( $email ) {
	$email = strtolower( trim( $email ) );
	delete_option( pycourse_learner_key( $email ) );
	$index = pycourse_learner_index();
	unset( $index[ $email ] );
	update_option( 'pycourse_learners', $index, false );
}

/**
 * Merge an incoming progress payload into the stored one. Every leaf entry
 * carries an "updated" timestamp (ms); the newer one wins. "passed" never
 * goes from true back to false.
 *
 * Shape:
 * {
 *   name: "Sam",
 *   lastActive: 1700000000000,
 *   lessons: { "<lessonId>": { "exercises": { "<exId>": { passed, code, attempts, usedSolution, updated } },
 *                               "examples": { "<n>": { code, updated } },
 *                               "visited": <ms> } },
 *   playground: { "<slot>": { title, code, updated } }
 * }
 */
function pycourse_merge_progress( $stored, $incoming ) {
	$out = is_array( $stored ) ? $stored : array();
	$out['lessons']    = isset( $out['lessons'] ) && is_array( $out['lessons'] ) ? $out['lessons'] : array();
	$out['playground'] = isset( $out['playground'] ) && is_array( $out['playground'] ) ? $out['playground'] : array();

	if ( isset( $incoming['name'] ) ) {
		$out['name'] = sanitize_text_field( mb_substr( (string) $incoming['name'], 0, 60 ) );
	}
	$out['lastActive'] = max( isset( $out['lastActive'] ) ? (int) $out['lastActive'] : 0, isset( $incoming['lastActive'] ) ? (int) $incoming['lastActive'] : 0, time() * 1000 );

	$index = pycourse_lesson_index();

	if ( isset( $incoming['lessons'] ) && is_array( $incoming['lessons'] ) ) {
		foreach ( $incoming['lessons'] as $lid => $lesson ) {
			$lid = sanitize_key( (string) $lid );
			if ( ! isset( $index[ $lid ] ) || ! is_array( $lesson ) ) {
				continue;
			}
			$cur = isset( $out['lessons'][ $lid ] ) && is_array( $out['lessons'][ $lid ] ) ? $out['lessons'][ $lid ] : array( 'exercises' => array(), 'examples' => array() );
			if ( isset( $lesson['visited'] ) ) {
				$cur['visited'] = max( isset( $cur['visited'] ) ? (int) $cur['visited'] : 0, (int) $lesson['visited'] );
			}
			if ( isset( $lesson['exercises'] ) && is_array( $lesson['exercises'] ) ) {
				foreach ( $lesson['exercises'] as $eid => $ex ) {
					$eid = sanitize_key( (string) $eid );
					if ( ! in_array( $eid, $index[ $lid ]['exercises'], true ) || ! is_array( $ex ) ) {
						continue;
					}
					$old     = isset( $cur['exercises'][ $eid ] ) && is_array( $cur['exercises'][ $eid ] ) ? $cur['exercises'][ $eid ] : array();
					$new_ts  = isset( $ex['updated'] ) ? (int) $ex['updated'] : 0;
					$old_ts  = isset( $old['updated'] ) ? (int) $old['updated'] : 0;
					$merged  = $new_ts >= $old_ts ? pycourse_clean_exercise( $ex ) : $old;
					$merged['passed']       = ! empty( $old['passed'] ) || ! empty( $ex['passed'] );
					$merged['usedSolution'] = ! empty( $old['usedSolution'] ) || ! empty( $ex['usedSolution'] );
					$merged['attempts']     = max( isset( $old['attempts'] ) ? (int) $old['attempts'] : 0, isset( $ex['attempts'] ) ? (int) $ex['attempts'] : 0 );
					if ( $merged['passed'] ) {
						$cands              = array_filter( array( isset( $old['passedAt'] ) ? (int) $old['passedAt'] : 0, isset( $ex['passedAt'] ) ? (int) $ex['passedAt'] : 0 ) );
						$merged['passedAt'] = $cands ? min( $cands ) : time() * 1000;
					}
					$cur['exercises'][ $eid ] = $merged;
				}
			}
			if ( isset( $lesson['examples'] ) && is_array( $lesson['examples'] ) ) {
				foreach ( $lesson['examples'] as $n => $ex ) {
					$n = (int) $n;
					if ( $n < 0 || $n > 40 || ! is_array( $ex ) ) {
						continue;
					}
					$old_ts = isset( $cur['examples'][ $n ]['updated'] ) ? (int) $cur['examples'][ $n ]['updated'] : 0;
					$new_ts = isset( $ex['updated'] ) ? (int) $ex['updated'] : 0;
					if ( $new_ts >= $old_ts ) {
						$cur['examples'][ $n ] = array(
							'code'    => pycourse_clean_code( isset( $ex['code'] ) ? $ex['code'] : '' ),
							'updated' => $new_ts,
						);
					}
				}
			}
			$out['lessons'][ $lid ] = $cur;
		}
	}

	if ( isset( $incoming['playground'] ) && is_array( $incoming['playground'] ) ) {
		foreach ( $incoming['playground'] as $slot => $item ) {
			$slot = sanitize_key( (string) $slot );
			if ( '' === $slot || ! is_array( $item ) ) {
				continue;
			}
			$old_ts = isset( $out['playground'][ $slot ]['updated'] ) ? (int) $out['playground'][ $slot ]['updated'] : 0;
			$new_ts = isset( $item['updated'] ) ? (int) $item['updated'] : 0;
			if ( $new_ts >= $old_ts ) {
				if ( ! empty( $item['deleted'] ) ) {
					unset( $out['playground'][ $slot ] );
					continue;
				}
				$out['playground'][ $slot ] = array(
					'title'   => sanitize_text_field( mb_substr( isset( $item['title'] ) ? (string) $item['title'] : '', 0, 80 ) ),
					'code'    => pycourse_clean_code( isset( $item['code'] ) ? $item['code'] : '' ),
					'updated' => $new_ts,
				);
			}
		}
		if ( count( $out['playground'] ) > 50 ) {
			uasort( $out['playground'], function ( $a, $b ) { return $b['updated'] <=> $a['updated']; } );
			$out['playground'] = array_slice( $out['playground'], 0, 50, true );
		}
	}

	return $out;
}

function pycourse_clean_exercise( $ex ) {
	return array(
		'passed'       => ! empty( $ex['passed'] ),
		'code'         => pycourse_clean_code( isset( $ex['code'] ) ? $ex['code'] : '' ),
		'attempts'     => isset( $ex['attempts'] ) ? (int) $ex['attempts'] : 0,
		'usedSolution' => ! empty( $ex['usedSolution'] ),
		'updated'      => isset( $ex['updated'] ) ? (int) $ex['updated'] : 0,
		'passedAt'     => isset( $ex['passedAt'] ) ? (int) $ex['passedAt'] : 0,
	);
}

/* Code is stored verbatim (it is never rendered as HTML), just bounded. */
function pycourse_clean_code( $code ) {
	$code = (string) $code;
	$code = str_replace( "\r\n", "\n", $code );
	$code = preg_replace( '/[^\P{C}\n\t]+/u', '', $code );
	return mb_substr( $code, 0, 20000 );
}

/* ------------------------------------------------------------------------
 * REST API: /wp-json/pycourse/v1/progress
 * --------------------------------------------------------------------- */

function pycourse_rest_routes() {
	register_rest_route( 'pycourse/v1', '/progress', array(
		array(
			'methods'             => 'GET',
			'callback'            => 'pycourse_rest_get_progress',
			'permission_callback' => 'pycourse_rest_throttle',
			'args'                => array( 'email' => array( 'required' => true ) ),
		),
		array(
			'methods'             => 'POST',
			'callback'            => 'pycourse_rest_save_progress',
			'permission_callback' => 'pycourse_rest_throttle',
		),
	) );
}
add_action( 'rest_api_init', 'pycourse_rest_routes' );

/* Public endpoint, so keep it polite: 120 requests per minute per IP. */
function pycourse_rest_throttle() {
	$ip  = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : '0';
	$key = 'pycourse_rl_' . md5( $ip );
	$n   = (int) get_transient( $key );
	if ( $n > 120 ) {
		return new WP_Error( 'pycourse_slow_down', 'Too many requests. Try again in a minute.', array( 'status' => 429 ) );
	}
	set_transient( $key, $n + 1, MINUTE_IN_SECONDS );
	return true;
}

function pycourse_rest_email( $raw ) {
	$email = strtolower( trim( sanitize_email( (string) $raw ) ) );
	if ( '' === $email || ! is_email( $email ) ) {
		return new WP_Error( 'pycourse_bad_email', 'That does not look like an email address.', array( 'status' => 400 ) );
	}
	return $email;
}

function pycourse_rest_get_progress( $request ) {
	$email = pycourse_rest_email( $request->get_param( 'email' ) );
	if ( is_wp_error( $email ) ) {
		return $email;
	}
	$data = pycourse_get_learner( $email );
	return rest_ensure_response( array(
		'email'    => $email,
		'found'    => null !== $data,
		'progress' => $data ? $data : new stdClass(),
	) );
}

function pycourse_rest_save_progress( $request ) {
	$body  = $request->get_json_params();
	$email = pycourse_rest_email( isset( $body['email'] ) ? $body['email'] : '' );
	if ( is_wp_error( $email ) ) {
		return $email;
	}
	$incoming = isset( $body['progress'] ) && is_array( $body['progress'] ) ? $body['progress'] : array();
	$stored   = pycourse_get_learner( $email );
	$merged   = pycourse_merge_progress( $stored, $incoming );
	if ( strlen( wp_json_encode( $merged ) ) > PYCOURSE_MAX_LEARNER_BYTES ) {
		return new WP_Error( 'pycourse_too_big', 'Saved work is too large. Delete some playground programs.', array( 'status' => 413 ) );
	}
	pycourse_put_learner( $email, $merged );
	return rest_ensure_response( array(
		'email'    => $email,
		'found'    => true,
		'progress' => $merged,
	) );
}

/* ------------------------------------------------------------------------
 * Progress summary helpers (shared by admin page and weekly email)
 * --------------------------------------------------------------------- */

function pycourse_summarize( $email, $data ) {
	$index   = pycourse_lesson_index();
	$total_l = count( $index );
	$total_e = 0;
	foreach ( $index as $l ) {
		$total_e += count( $l['exercises'] );
	}
	$done_l   = 0;
	$done_e   = 0;
	$solution = 0;
	$lessons  = array();
	$last_id  = '';
	$last_ts  = 0;
	foreach ( $index as $lid => $l ) {
		$p      = isset( $data['lessons'][ $lid ] ) ? $data['lessons'][ $lid ] : array();
		$passed = 0;
		$tried  = 0;
		foreach ( $l['exercises'] as $eid ) {
			$ex = isset( $p['exercises'][ $eid ] ) ? $p['exercises'][ $eid ] : null;
			if ( $ex ) {
				$tried++;
				if ( ! empty( $ex['passed'] ) ) {
					$passed++;
				}
				if ( ! empty( $ex['usedSolution'] ) ) {
					$solution++;
				}
				if ( isset( $ex['updated'] ) && (int) $ex['updated'] > $last_ts ) {
					$last_ts = (int) $ex['updated'];
					$last_id = $lid;
				}
			}
		}
		if ( isset( $p['visited'] ) && (int) $p['visited'] > $last_ts ) {
			$last_ts = (int) $p['visited'];
			$last_id = $lid;
		}
		$n        = count( $l['exercises'] );
		$complete = $n > 0 && $passed === $n;
		if ( $complete ) {
			$done_l++;
		}
		$done_e   += $passed;
		$lessons[] = array(
			'id'       => $lid,
			'title'    => $l['title'],
			'section'  => $l['section'],
			'passed'   => $passed,
			'tried'    => $tried,
			'total'    => $n,
			'complete' => $complete,
			'visited'  => ! empty( $p['visited'] ),
		);
	}
	return array(
		'email'          => $email,
		'name'           => isset( $data['name'] ) ? $data['name'] : '',
		'lastActive'     => isset( $data['lastActive'] ) ? (int) $data['lastActive'] : 0,
		'lessonsDone'    => $done_l,
		'lessonsTotal'   => $total_l,
		'exercisesDone'  => $done_e,
		'exercisesTotal' => $total_e,
		'usedSolution'   => $solution,
		'lastLesson'     => $last_id ? $index[ $last_id ]['title'] : '',
		'playground'     => isset( $data['playground'] ) ? count( $data['playground'] ) : 0,
		'lessons'        => $lessons,
	);
}

function pycourse_ago( $ms ) {
	if ( ! $ms ) {
		return 'never';
	}
	return human_time_diff( (int) ( $ms / 1000 ), time() ) . ' ago';
}

/* ------------------------------------------------------------------------
 * Weekly summary email
 * --------------------------------------------------------------------- */

function pycourse_schedule_summary() {
	$enabled = (bool) get_option( 'pycourse_weekly_email', 0 );
	$next    = wp_next_scheduled( 'pycourse_weekly_summary' );
	if ( $enabled && ! $next ) {
		/* Next Sunday evening, local time. */
		$ts = strtotime( 'next sunday 18:00', current_time( 'timestamp' ) ) - ( (int) get_option( 'gmt_offset' ) * HOUR_IN_SECONDS );
		wp_schedule_event( $ts, 'weekly', 'pycourse_weekly_summary' );
	} elseif ( ! $enabled && $next ) {
		wp_clear_scheduled_hook( 'pycourse_weekly_summary' );
	}
}
add_action( 'update_option_pycourse_weekly_email', 'pycourse_schedule_summary' );
add_action( 'add_option_pycourse_weekly_email', 'pycourse_schedule_summary' );

function pycourse_summary_text() {
	$index = pycourse_learner_index();
	if ( ! $index ) {
		return "No one has started the Python course yet.\n\n" . home_url( '/' . PYCOURSE_SLUG . '/' );
	}
	$week  = time() * 1000 - 7 * DAY_IN_SECONDS * 1000;
	$lines = array( 'Python course, weekly summary', '' );
	foreach ( $index as $email => $meta ) {
		$data = pycourse_get_learner( $email );
		if ( ! $data ) {
			continue;
		}
		$s         = pycourse_summarize( $email, $data );
		$this_week = 0;
		foreach ( $data['lessons'] as $l ) {
			if ( empty( $l['exercises'] ) ) {
				continue;
			}
			foreach ( $l['exercises'] as $ex ) {
				if ( ! empty( $ex['passed'] ) && isset( $ex['passedAt'] ) && (int) $ex['passedAt'] >= $week ) {
					$this_week++;
				}
			}
		}
		$lines[] = sprintf( '%s <%s>', $s['name'] ? $s['name'] : 'Learner', $email );
		$lines[] = sprintf( '  Lessons complete: %d of %d', $s['lessonsDone'], $s['lessonsTotal'] );
		$lines[] = sprintf( '  Exercises passed: %d of %d (%d this week)', $s['exercisesDone'], $s['exercisesTotal'], $this_week );
		$lines[] = sprintf( '  Last active: %s%s', pycourse_ago( $s['lastActive'] ), $s['lastLesson'] ? ', in "' . $s['lastLesson'] . '"' : '' );
		if ( $s['usedSolution'] ) {
			$lines[] = sprintf( '  Peeked at the solution on %d exercise(s).', $s['usedSolution'] );
		}
		$lines[] = '';
	}
	$lines[] = 'Details: ' . admin_url( 'options-general.php?page=python-course' );
	return implode( "\n", $lines );
}

function pycourse_send_summary() {
	$to = get_option( 'pycourse_summary_to', '' );
	if ( ! is_email( $to ) ) {
		$to = get_option( 'admin_email' );
	}
	return wp_mail( $to, 'Python course: weekly progress', pycourse_summary_text() );
}
add_action( 'pycourse_weekly_summary', 'pycourse_send_summary' );

/* ------------------------------------------------------------------------
 * Settings > Python Course: learners, progress, weekly email
 * --------------------------------------------------------------------- */

function pycourse_settings_menu() {
	add_options_page( 'Python Course', 'Python Course', 'manage_options', 'python-course', 'pycourse_settings_page' );
}
add_action( 'admin_menu', 'pycourse_settings_menu' );

function pycourse_settings_init() {
	register_setting( 'pycourse', 'pycourse_weekly_email', array( 'sanitize_callback' => 'absint' ) );
	register_setting( 'pycourse', 'pycourse_summary_to', array( 'sanitize_callback' => 'sanitize_email' ) );
}
add_action( 'admin_init', 'pycourse_settings_init' );

function pycourse_admin_actions() {
	if ( ! is_admin() || ! current_user_can( 'manage_options' ) || empty( $_POST['pycourse_action'] ) ) {
		return;
	}
	check_admin_referer( 'pycourse_admin' );
	$action = sanitize_key( $_POST['pycourse_action'] );
	$notice = '';
	if ( 'delete' === $action && ! empty( $_POST['email'] ) ) {
		pycourse_delete_learner( sanitize_email( wp_unslash( $_POST['email'] ) ) );
		$notice = 'deleted';
	} elseif ( 'test_email' === $action ) {
		$notice = pycourse_send_summary() ? 'sent' : 'send_failed';
	} elseif ( 'export' === $action ) {
		$all = array();
		foreach ( pycourse_learner_index() as $email => $meta ) {
			$all[ $email ] = pycourse_get_learner( $email );
		}
		nocache_headers();
		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename="python-course-progress-' . gmdate( 'Y-m-d' ) . '.json"' );
		echo wp_json_encode( $all, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
		exit;
	}
	wp_safe_redirect( add_query_arg( array( 'page' => 'python-course', 'pycourse_notice' => $notice ), admin_url( 'options-general.php' ) ) );
	exit;
}
add_action( 'admin_init', 'pycourse_admin_actions' );

function pycourse_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$url    = home_url( '/' . PYCOURSE_SLUG . '/' );
	$index  = pycourse_learner_index();
	$detail = isset( $_GET['learner'] ) ? sanitize_email( wp_unslash( $_GET['learner'] ) ) : '';
	$notice = isset( $_GET['pycourse_notice'] ) ? sanitize_key( $_GET['pycourse_notice'] ) : '';
	$msgs   = array(
		'deleted'     => 'Learner deleted.',
		'sent'        => 'Summary email sent.',
		'send_failed' => 'WordPress could not send the email. Check your site\'s mail setup (an SMTP plugin usually fixes this).',
	);
	?>
	<div class="wrap">
		<h1>Python Course</h1>
		<?php if ( $notice && isset( $msgs[ $notice ] ) ) : ?>
			<div class="notice notice-<?php echo 'send_failed' === $notice ? 'error' : 'success'; ?> is-dismissible"><p><?php echo esc_html( $msgs[ $notice ] ); ?></p></div>
		<?php endif; ?>
		<p>The course lives at <a href="<?php echo esc_url( $url ); ?>"><?php echo esc_html( $url ); ?></a>. Learners type an email address on the first screen and their progress saves to this site under that address.</p>

		<?php if ( $detail && pycourse_get_learner( $detail ) ) : ?>
			<?php $s = pycourse_summarize( $detail, pycourse_get_learner( $detail ) ); ?>
			<p><a href="<?php echo esc_url( admin_url( 'options-general.php?page=python-course' ) ); ?>">&larr; All learners</a></p>
			<h2><?php echo esc_html( $s['name'] ? $s['name'] : 'Learner' ); ?> <small>&lt;<?php echo esc_html( $detail ); ?>&gt;</small></h2>
			<p>
				<?php echo (int) $s['lessonsDone']; ?> of <?php echo (int) $s['lessonsTotal']; ?> lessons complete,
				<?php echo (int) $s['exercisesDone']; ?> of <?php echo (int) $s['exercisesTotal']; ?> exercises passed.
				Last active <?php echo esc_html( pycourse_ago( $s['lastActive'] ) ); ?>.
				<?php echo (int) $s['playground']; ?> saved playground program(s).
			</p>
			<table class="widefat striped" style="max-width:900px">
				<thead><tr><th>Lesson</th><th>Section</th><th>Exercises passed</th><th>Status</th></tr></thead>
				<tbody>
				<?php foreach ( $s['lessons'] as $l ) : ?>
					<tr>
						<td><?php echo esc_html( $l['title'] ); ?></td>
						<td><?php echo esc_html( $l['section'] ); ?></td>
						<td><?php echo (int) $l['passed']; ?> / <?php echo (int) $l['total']; ?></td>
						<td><?php echo $l['complete'] ? '&#10003; Complete' : ( $l['tried'] ? 'In progress' : ( $l['visited'] ? 'Opened' : 'Not started' ) ); ?></td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
			<form method="post" style="margin-top:1em" onsubmit="return confirm('Delete all saved progress for this learner? This cannot be undone.');">
				<?php wp_nonce_field( 'pycourse_admin' ); ?>
				<input type="hidden" name="pycourse_action" value="delete">
				<input type="hidden" name="email" value="<?php echo esc_attr( $detail ); ?>">
				<?php submit_button( 'Delete this learner', 'delete', 'submit', false ); ?>
			</form>
		<?php else : ?>
			<h2>Learners</h2>
			<?php if ( ! $index ) : ?>
				<p>No one has started yet.</p>
			<?php else : ?>
				<table class="widefat striped" style="max-width:1000px">
					<thead><tr><th>Name</th><th>Email</th><th>Lessons</th><th>Exercises</th><th>Last active</th><th>Working on</th></tr></thead>
					<tbody>
					<?php foreach ( $index as $email => $meta ) :
						$data = pycourse_get_learner( $email );
						if ( ! $data ) { continue; }
						$s = pycourse_summarize( $email, $data ); ?>
						<tr>
							<td><a href="<?php echo esc_url( add_query_arg( array( 'page' => 'python-course', 'learner' => $email ), admin_url( 'options-general.php' ) ) ); ?>"><?php echo esc_html( $s['name'] ? $s['name'] : 'Learner' ); ?></a></td>
							<td><?php echo esc_html( $email ); ?></td>
							<td><?php echo (int) $s['lessonsDone']; ?> / <?php echo (int) $s['lessonsTotal']; ?></td>
							<td><?php echo (int) $s['exercisesDone']; ?> / <?php echo (int) $s['exercisesTotal']; ?></td>
							<td><?php echo esc_html( pycourse_ago( $s['lastActive'] ) ); ?></td>
							<td><?php echo esc_html( $s['lastLesson'] ); ?></td>
						</tr>
					<?php endforeach; ?>
					</tbody>
				</table>
				<form method="post" style="margin-top:.5em">
					<?php wp_nonce_field( 'pycourse_admin' ); ?>
					<input type="hidden" name="pycourse_action" value="export">
					<?php submit_button( 'Download all progress (JSON)', 'secondary', 'submit', false ); ?>
				</form>
			<?php endif; ?>

			<h2>Weekly summary email</h2>
			<form method="post" action="options.php">
				<?php settings_fields( 'pycourse' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row">Send a weekly summary</th>
						<td>
							<label><input type="checkbox" name="pycourse_weekly_email" value="1" <?php checked( 1, (int) get_option( 'pycourse_weekly_email', 0 ) ); ?>> Email a progress summary every Sunday evening</label>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="pycourse_summary_to">Send to</label></th>
						<td>
							<input type="email" id="pycourse_summary_to" name="pycourse_summary_to" class="regular-text" value="<?php echo esc_attr( get_option( 'pycourse_summary_to', '' ) ); ?>" placeholder="<?php echo esc_attr( get_option( 'admin_email' ) ); ?>">
							<p class="description">Leave blank to use the site admin email.</p>
						</td>
					</tr>
				</table>
				<?php submit_button( 'Save' ); ?>
			</form>
			<form method="post">
				<?php wp_nonce_field( 'pycourse_admin' ); ?>
				<input type="hidden" name="pycourse_action" value="test_email">
				<?php submit_button( 'Send a summary now', 'secondary', 'submit', false ); ?>
			</form>
		<?php endif; ?>
	</div>
	<?php
}
