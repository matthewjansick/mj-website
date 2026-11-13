/*
 * Python engine. Runs as a module Web Worker (normal case) or, when the page
 * is not cross-origin isolated, as a module script on the main thread.
 *
 * Messages in:  init, run, test, stop
 * Messages out: ready, out, input, done, result, error
 */

const IN_WORKER = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;

let send = (m) => self.postMessage(m);
let pyodide = null;
let ctl = null;       // Int32Array over the shared stdin buffer: [state, length]
let data = null;      // Uint8Array over the shared stdin buffer (after the header)
let interrupt = null; // Uint8Array(1) shared: 2 = KeyboardInterrupt
let runId = 0;
let testStdin = null; // array of lines while running tests (never used; tests feed input in Python)
let syncPrompt = null; // main-thread fallback: function(promptText) -> string|null
const decoder = new TextDecoder();
const encoder = new TextEncoder();

const HARNESS = String.raw`
import sys, io, builtins, contextlib, traceback, re, ast, json, random

def __pyc_fmt_exc():
    et, ev, tb = sys.exc_info()
    frames = [f for f in traceback.extract_tb(tb) if f.filename == 'main.py']
    s = ''
    if frames:
        s += 'Traceback (most recent call last):\n' + ''.join(traceback.format_list(frames))
    s += ''.join(traceback.format_exception_only(et, ev))
    hint = __pyc_hint(et, ev)
    if hint:
        s += '\nHint: ' + hint + '\n'
    return s

def __pyc_hint(et, ev):
    msg = str(ev)
    if et is NameError:
        return "Python doesn't know that name. Check the spelling, and make sure you created it (with =) before this line. Text needs quotes around it."
    if et is IndentationError:
        return "The spaces at the start of a line matter. Lines inside if, for, while and def must be indented (4 spaces), and lines at the same level must line up."
    if et is SyntaxError:
        if 'unterminated' in msg:
            return "A string is missing its closing quote. Every opening quote needs a matching one on the same line."
        if 'was never closed' in msg or 'EOF' in msg:
            return "Something was opened but never closed. Count your ( ) and quotes."
        if 'expected' in msg and ':' in msg:
            return "Did you forget the colon : at the end of the line?"
        if 'invalid syntax' in msg or 'Perhaps you forgot a comma' in msg:
            return "Python couldn't read this line. Check for missing quotes, commas, parentheses, or a colon."
        return "Python couldn't read this line. Look at the ^ marker to see where it got confused."
    if et is TypeError:
        if 'can only concatenate str' in msg or 'must be str, not' in msg:
            return "You can't add text and a number together. Use str(number) to turn the number into text, or an f-string."
        if 'unsupported operand' in msg:
            return "Those two things can't be combined with that operator. Check their types with type()."
        if 'not subscriptable' in msg:
            return "You used [ ] on something that isn't a list, string or dictionary."
        if 'missing' in msg and 'argument' in msg:
            return "You called a function without giving it everything it needs between the parentheses."
        if 'takes' in msg and 'given' in msg:
            return "You gave the function the wrong number of things between the parentheses."
        if 'not callable' in msg:
            return "You put ( ) after something that isn't a function. Did you reuse a function name as a variable?"
    if et is ValueError:
        if 'invalid literal for int()' in msg:
            return "int() only works on text that looks like a whole number, like '42'. Check what the user typed."
        if 'could not convert string to float' in msg:
            return "float() only works on text that looks like a number, like '3.5'."
    if et is ZeroDivisionError:
        return "You divided by zero. Check the value on the right of the / or %."
    if et is IndexError:
        return "You asked for a position that doesn't exist. Remember positions start at 0, and the last one is len(x) - 1."
    if et is KeyError:
        return "That key isn't in the dictionary. Use 'in' to check first, or .get(key)."
    if et is AttributeError:
        return "That thing doesn't have a method or attribute with that name. Check the spelling and the type."
    if et is RecursionError:
        return "A function kept calling itself forever. Make sure it has a stopping case."
    if et is KeyboardInterrupt:
        return None
    return None

def __pyc_run(code):
    ns = {'__name__': '__main__'}
    try:
        exec(compile(code, 'main.py', 'exec'), ns)
    except SystemExit:
        pass
    except KeyboardInterrupt:
        print('\n[Stopped]', file=sys.stderr)
    except BaseException:
        print(__pyc_fmt_exc(), file=sys.stderr, end='')

def __pyc_norm(s, mode):
    s = s.replace('\r\n', '\n')
    lines = [ln.rstrip() for ln in s.split('\n')]
    while lines and lines[-1] == '':
        lines.pop()
    out = '\n'.join(lines)
    if mode == 'loose':
        out = re.sub(r'\s+', ' ', out).strip().lower()
    return out

def __pyc_literal(s):
    if isinstance(s, str):
        try:
            return ast.literal_eval(s)
        except Exception:
            return s
    return s

def __pyc_same(a, b):
    if isinstance(a, float) or isinstance(b, float):
        try:
            return abs(float(a) - float(b)) < 1e-6
        except Exception:
            return False
    return a == b

def __pyc_run_tests(code, tests):
    tests = json.loads(tests)
    return json.dumps([__pyc_run_one(code, t) for t in tests])

def __pyc_run_one(code, t):
    name = t.get('name', 'Test')
    inputs = [str(x) for x in t.get('stdin', [])]
    used = []
    def fake_input(prompt=''):
        print(prompt, end='')
        if not inputs:
            raise EOFError('__PYC_NO_INPUT__')
        v = inputs.pop(0)
        used.append(v)
        print(v)
        return v
    buf = io.StringIO()
    ns = {'__name__': '__main__'}
    old_input = builtins.input
    builtins.input = fake_input
    if 'seed' in t:
        random.seed(t['seed'])
    err = None
    try:
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            exec(compile(code, 'main.py', 'exec'), ns)
    except EOFError as e:
        if '__PYC_NO_INPUT__' in str(e):
            err = 'Your program asked for more input than this test provides. Inputs given: ' + ', '.join(repr(u) for u in used)
        else:
            err = __pyc_fmt_exc()
    except SystemExit:
        pass
    except BaseException:
        err = __pyc_fmt_exc()
    finally:
        builtins.input = old_input
    out = buf.getvalue()
    if not err and t.get('setup'):
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                exec(compile(t['setup'], 'checker_setup.py', 'exec'), ns)
        except BaseException:
            err = 'The checker setup failed: ' + ''.join(traceback.format_exception_only(*sys.exc_info()[:2]))
    res = {'name': name, 'passed': True, 'message': '', 'output': out[:3000], 'stdin': used, 'expected': None, 'got': None}

    def fail(message, expected=None, got=None):
        res['passed'] = False
        res['message'] = message
        res['expected'] = expected
        res['got'] = got
        return res

    # Source checks run even if the program crashed, so the hint is useful.
    for rule in t.get('code_regex', []):
        if not re.search(rule['pattern'], code, re.M):
            return fail(rule.get('why', 'Your code is missing something this exercise asks for.'))
    for rule in t.get('code_not_regex', []):
        if re.search(rule['pattern'], code, re.M):
            return fail(rule.get('why', 'Your code uses something this exercise asks you not to use.'))

    runtime_keys = ('output_equals', 'output_contains', 'output_not_contains', 'output_regex', 'output_lines', 'last_line', 'must_define', 'must_define_function', 'vars', 'calls')
    source_only = not any(k in t for k in runtime_keys)
    if err and source_only and 'asked for more input' in err:
        err = None  # a source-only check does not need the program to finish
    if err:
        return fail('Your program crashed.', None, err)

    mode = t.get('match', 'exact')
    if 'output_equals' in t:
        exp = __pyc_norm(str(t['output_equals']), mode)
        got = __pyc_norm(out, mode)
        if exp != got:
            return fail('The output is not quite right.', t['output_equals'], out)
    for needle in ([t['output_contains']] if isinstance(t.get('output_contains'), str) else t.get('output_contains', [])):
        a = __pyc_norm(str(needle), mode)
        b = __pyc_norm(out, mode)
        if a not in b:
            return fail('The output should include: ' + repr(needle), needle, out)
    for needle in ([t['output_not_contains']] if isinstance(t.get('output_not_contains'), str) else t.get('output_not_contains', [])):
        if __pyc_norm(str(needle), mode) in __pyc_norm(out, mode):
            return fail('The output should NOT include: ' + repr(needle), None, out)
    if 'output_regex' in t:
        if not re.search(t['output_regex'], out, re.M | (re.I if mode == 'loose' else 0)):
            return fail(t.get('why', 'The output does not match what was expected.'), t.get('expected_hint'), out)
    if 'output_lines' in t:
        lines = [ln for ln in __pyc_norm(out, mode).split('\n')]
        n = int(t['output_lines'])
        if len(lines) != n:
            return fail('Expected %d line(s) of output, got %d.' % (n, len(lines)), '%d lines' % n, out)
    if 'last_line' in t:
        lines = __pyc_norm(out, mode).split('\n')
        last = lines[-1] if lines else ''
        if last != __pyc_norm(str(t['last_line']), mode):
            return fail('The last line of output should be: ' + repr(t['last_line']), t['last_line'], out)

    for v in t.get('must_define', []):
        if v not in ns:
            return fail('Your program should define ' + repr(v) + '.')
    for v in t.get('must_define_function', []):
        if v not in ns or not callable(ns[v]):
            return fail('Your program should define a function called ' + repr(v) + '.')

    for chk in t.get('vars', []):
        nm = chk['name']
        if nm not in ns:
            return fail('There should be a variable called ' + repr(nm) + '.')
        if 'type' in chk and type(ns[nm]).__name__ != chk['type']:
            return fail('%s should be a %s, but it is a %s.' % (nm, chk['type'], type(ns[nm]).__name__), chk['type'], type(ns[nm]).__name__)
        if 'expect' in chk:
            exp = __pyc_literal(chk['expect'])
            if not __pyc_same(ns[nm], exp):
                return fail('%s has the wrong value.' % nm, repr(exp), repr(ns[nm]))

    for call in t.get('calls', []):
        expr = call['expr']
        cbuf = io.StringIO()
        cinputs = [str(x) for x in call.get('stdin', [])]
        def c_input(prompt=''):
            print(prompt, end='')
            if not cinputs:
                raise EOFError('__PYC_NO_INPUT__')
            v = cinputs.pop(0)
            print(v)
            return v
        builtins.input = c_input
        raised = None
        try:
            with contextlib.redirect_stdout(cbuf), contextlib.redirect_stderr(cbuf):
                val = eval(expr, ns)
        except BaseException as e:
            builtins.input = old_input
            if 'raises' in call:
                raised = e
            else:
                return fail('Calling ' + expr + ' crashed.', None, __pyc_fmt_exc())
        finally:
            builtins.input = old_input
        if 'raises' in call:
            if raised is None:
                return fail(expr + ' should raise ' + call['raises'] + ' but it did not.', call['raises'] + ' raised', 'no error, returned ' + repr(val))
            if type(raised).__name__ != call['raises']:
                return fail(expr + ' raised the wrong kind of error.', call['raises'], type(raised).__name__ + ': ' + str(raised))
            if 'message' in call and str(raised) != call['message']:
                return fail(expr + ' raised ' + call['raises'] + ' with the wrong message.', call['message'], str(raised))
            continue
        cout = cbuf.getvalue()
        if 'no_print' in call and call['no_print'] and cout.strip():
            return fail(expr + ' should return the answer, not print it.', 'nothing printed', cout)
        if 'expect' in call:
            exp = __pyc_literal(call['expect'])
            if 'type' in call and type(val).__name__ != call['type']:
                return fail('%s should return a %s, but it returned a %s.' % (expr, call['type'], type(val).__name__), call['type'], type(val).__name__)
            if not __pyc_same(val, exp):
                return fail(expr + ' returned the wrong value.', repr(exp), repr(val))
        if 'expect_type' in call and type(val).__name__ != call['expect_type']:
            return fail('%s should return a %s, but it returned a %s.' % (expr, call['expect_type'], type(val).__name__), call['expect_type'], type(val).__name__)
        if 'prints' in call:
            a = __pyc_norm(str(call['prints']), mode)
            b = __pyc_norm(cout, mode)
            if a != b:
                return fail(expr + ' should print something different.', call['prints'], cout)
        if 'prints_contains' in call:
            if __pyc_norm(str(call['prints_contains']), mode) not in __pyc_norm(cout, mode):
                return fail(expr + ' should print: ' + repr(call['prints_contains']), call['prints_contains'], cout)
    return res
`;

function post(m) { send(m); }

/* Stdout batching and a per-run output cap, so a runaway print loop cannot flood the page. */
const OUT_LIMIT = 200000;
let outBuf = '', outStream = 'stdout', outCount = 0, lastFlush = 0, outTripped = false;
function flushOut() {
  if (outBuf) { send({ type: 'out', stream: outStream, text: outBuf }); outBuf = ''; }
  lastFlush = Date.now();
}
function writeOut(stream, buf) {
  const text = decoder.decode(buf);
  if (stream !== outStream) { flushOut(); outStream = stream; }
  outBuf += text;
  outCount += text.length;
  if (outBuf.length > 8192 || Date.now() - lastFlush > 40) flushOut();
  if (outCount > OUT_LIMIT && !outTripped) {
    outTripped = true;
    flushOut();
    send({ type: 'out', stream: 'stderr', text: '\n[Stopped: your program printed too much. Is there an infinite loop?]\n' });
    if (interrupt) interrupt[0] = 2;
    else throw new Error('Output limit reached');
  }
  return buf.length;
}
function resetOut() { outBuf = ''; outCount = 0; outTripped = false; lastFlush = Date.now(); }

function stdinRead() {
  // Called by Pyodide when Python reads a line. Blocks until the page answers.
  if (ctl) {
    flushOut();
    Atomics.store(ctl, 0, 0);
    post({ type: 'input' });
    Atomics.wait(ctl, 0, 0);
    const len = Atomics.load(ctl, 1);
    if (len < 0) {
      if (interrupt) interrupt[0] = 2;
      return null;
    }
    return decoder.decode(data.slice(0, len));
  }
  if (syncPrompt) {
    flushOut();
    const v = syncPrompt();
    return v === null ? null : v;
  }
  return null;
}

async function init(msg) {
  try {
    if (msg.sab) {
      ctl = new Int32Array(msg.sab, 0, 2);
      data = new Uint8Array(msg.sab, 8);
    }
    if (msg.interrupt) interrupt = new Uint8Array(msg.interrupt);
    const mod = await import(msg.pyodideBase + 'pyodide.mjs');
    pyodide = await mod.loadPyodide({ indexURL: msg.pyodideBase });
    pyodide.setStdout({ write: (buf) => writeOut('stdout', buf) });
    pyodide.setStderr({ write: (buf) => writeOut('stderr', buf) });
    pyodide.setStdin({ stdin: stdinRead });
    if (interrupt) pyodide.setInterruptBuffer(interrupt);
    pyodide.runPython(HARNESS);
    post({ type: 'ready', version: pyodide.version });
  } catch (e) {
    post({ type: 'error', message: 'Python could not start: ' + (e && e.message ? e.message : String(e)) });
  }
}

function run(msg) {
  runId = msg.id;
  if (interrupt) interrupt[0] = 0;
  resetOut();
  try {
    const fn = pyodide.globals.get('__pyc_run');
    fn(msg.code);
    fn.destroy && fn.destroy();
    flushOut();
    post({ type: 'done', id: msg.id, ok: true });
  } catch (e) {
    flushOut();
    post({ type: 'out', stream: 'stderr', text: String(e && e.message ? e.message : e) + '\n' });
    post({ type: 'done', id: msg.id, ok: false });
  }
}

function test(msg) {
  if (interrupt) interrupt[0] = 0;
  resetOut();
  try {
    const fn = pyodide.globals.get('__pyc_run_tests');
    const json = fn(msg.code, JSON.stringify(msg.tests));
    fn.destroy && fn.destroy();
    flushOut();
    post({ type: 'result', id: msg.id, results: JSON.parse(json) });
  } catch (e) {
    flushOut();
    post({ type: 'result', id: msg.id, results: [{ name: 'Checker', passed: false, message: 'The checker crashed: ' + String(e && e.message ? e.message : e), output: '' }] });
  }
}

function handle(msg) {
  switch (msg.type) {
    case 'init': init(msg); break;
    case 'run': run(msg); break;
    case 'test': test(msg); break;
  }
}

if (IN_WORKER) {
  self.onmessage = (e) => handle(e.data);
} else {
  // Main-thread fallback: the page wires us up and provides a blocking prompt.
  window.PyEngineInline = {
    attach(sendFn, promptFn) { send = sendFn; syncPrompt = promptFn; },
    handle,
  };
  window.dispatchEvent(new Event('pyengine-inline-ready'));
}
