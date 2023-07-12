import CLDR from "cldr-segmentation";
import Mustache from "mustache";
import { DataSet } from "vis-data";
import { Network } from "vis-network";

import "uikit/dist/css/uikit.min.css";
import UIkit from "uikit";
import UIkitIcons from "uikit/dist/js/uikit-icons";
UIkit.use(UIkitIcons);

import * as parser from "./parser.mjs";
import * as FileSaver from "./FileSaver.mjs";

/**
 * Select file(s).
 * @param {String} contentType The content type of files you wish to select. For instance, use "image/*" to select all types of images.
 * @param {Boolean} multiple Indicates if the user can select multiple files.
 * @returns {Promise<File|FileList|null>} A promise of a file or array of files in case the multiple parameter is true.
 */
 function selectFile(contentType, multiple) {
    return new Promise(resolve => {
        let input = document.createElement('input');
        input.type = 'file';
        input.multiple = multiple;
        input.accept = contentType;

        let resolved = false;

        input.onchange = () => {
            resolved = true;

            let files = Array.from(input.files);
            if (multiple)
                resolve(files);
            else
                resolve(files[0]);
        };

        document.addEventListener('focusin', () => {
            setTimeout(() => { if (!resolved) resolve(null); }, 500);
        }, { capture: true, once: true });

        input.click();
    });
}

class TMError extends Error {
    constructor(message, location) {
        super(message);
        this.location = location;
    }
}

const L = -1;
const N = 0;
const R = 1;

const MOVE = {
    L: L,
    N: N,
    R: R
};

const MOVE_NAME = {
    "-1": "L",
    "0": "N",
    "1": "R"
}

class Transition {
    constructor (tableEntry) {
        this.tableEntry = tableEntry;
    }

    get state() {
        return this.tableEntry.state;
    }

    get read() {
        return this.tableEntry.read;
    }

    get write() {
        return this.tableEntry.write;
    }

    get move() {
        return MOVE[this.tableEntry.move];
    }

    get next() {
        return this.tableEntry.next;
    }
}

function buildTransitionMatrix(spec) {
    const tm = {};

    tm[spec.init] = {};

    for (const s in spec.outputs)
        if (!(s in tm))
            tm[s] = {};

    for (const t of spec.table) {
        if (!(t.state in tm))
            tm[t.state] = {};

        if (!(t.next in tm))
            tm[t.next] = {};

        if (t.read in tm[t.state]) {
            const {write, move, next} = tm[t.state][t.read];
            if (write === t.write && move === MOVE[t.move] && next === t.next) {
                console.warn(`Duplicate transition for state '${t.state}' and symbol '${t.read}'`);
            } else {
                throw new TMError(`Inconsistent transitions for state '${t.state}' and symbol '${t.read}'`, t.loc);
            }
        } else {
            tm[t.state][t.read] = new Transition(t);
        }
    }

    return tm;
}

function topoSortStates(init, tm) {
    const remaining = {};
    const sorted = [];
    const stack = [];

    for (const state in tm)
        remaining[state] = 1;

    let root = init;

    while (root) {
        delete remaining[root];
        stack.push([root, Object.values(tm[root]).map(t => t.next), 0]);

        while (stack.length > 0) {
            let [state, adj, i] = stack[stack.length - 1];
            for (; i < adj.length; ++i) {
                if (!(adj[i] in remaining))
                    continue;

                delete remaining[adj[i]];
                stack.push([adj[i], Object.values(tm[adj[i]]).map(t => t.next), 0]);
                break;
            }

            if (i == adj.length) {
                stack.pop();
                sorted.push(state);
            }
        }

        root = null;

        for (const state in remaining) {
            root = state;
            break;
        }
    }

    sorted.reverse();

    return sorted;
}

const WS = /\s/;

const TABLE =
`<table class="uk-table uk-table-middle uk-table-divider uk-table-striped uk-table-hover uk-table-small">
    <thead>
        <tr>
            <th class="uk-table-shrink"></th>
            <th class="uk-table-shrink" title="Symbol under head">Head&nbsp;→</th>
            {{#symbols}}
            <th class="symbol" colspan="3" data-read="{{.}}">{{.}}</th>
            {{/symbols}}
        </tr>
        <tr>
            <th class="uk-table-shrink"></th>
            <th class="uk-table-shrink" title="Current state">State&nbsp;↓</th>
            {{#symbols}}
            <th class="uk-table-shrink" title="Write">W</th>
            <th class="uk-table-shrink" title="Move">M</th>
            <th title="Next state">Next</th>
            {{/symbols}}
        </tr>
    </thead>
    <tbody>
        {{#states}}
        <tr>
            <th class="annotation uk-table-shrink" style="vertical-align: middle;">
                {{#init}}Initial{{#output}} {{/output}}{{/init}}{{#output}}{{.}}{{/output}}
            </th>
            <th class="state uk-table-shrink" style="vertical-align: middle;" data-state="{{label}}">{{label}}</th>
            {{#transitions}}
            {{#halt}}
                <td class="transition" colspan="2" style="text-align: center;" data-state="{{label}}" data-read="{{read}}">HALT</td>
                <td class="transition" data-state="{{label}}" data-read="{{read}}"></td>
            {{/halt}}
            {{^halt}}
            <td class="transition uk-table-shrink" data-state="{{label}}" data-read="{{read}}">{{write}}</td>
            <td class="transition uk-table-shrink" data-state="{{label}}" data-read="{{read}}">{{move}}</td>
            <td class="transition" data-state="{{label}}" data-read="{{read}}">{{next}}</td>
            {{/halt}}
            {{/transitions}}
        </tr>
        {{/states}}
    </tbody>
</table>`

Mustache.parse(TABLE);

const TRACE_EMPTY = `<tr class="empty"><td colspan="6">No steps performed</td></tr>`;
const TRACE_ROW =
    `<td class="uk-table-shrink number"></td>
    <td class="uk-table-shrink">{{state}}</td>
    <td class="uk-table-shrink ctr">{{read}}</td>
    <td class="uk-table-shrink ctr">{{write}}</td>
    <td class="uk-table-shrink ctr">{{move}}</td>
    <td>{{next}}</td>`;

Mustache.parse(TRACE_ROW);

const LOOP = {
    arrowStrikethrough: true,
    smooth: {
        enabled: true,
        type: 'curvedCCW',
        roundness: 0.8
    }
};

const INSERT_OP = /^insert(Text|FromYank|FromDrop|FromPaste|FromPasteAsQuotation)$/;

class App {
    constructor() {
        this.started = false;
        this.updateTimeout = null;

        this.transitionMatrix = {};
        this.state = null;

        this.head = 0;
        this.leftmost = 0;
        this.rightmost = 0;
        this.tapeLeft = [];
        this.tapeRight = [];

        this.trace = [];

        this.steppingDelay = 250;
        this.steppingInterval = null;
    }

    reportError(message, location) {
        this.editorErrorContainer.innerText = message;
        this.editor.classList.add('show-error');

        const start = location.start.offset;

        let length = this.editorTextArea.value.slice(start).search(WS);
        if (length === -1)
            length = this.editorTextArea.value.length - start;

        const end = Math.max(start + length, location.end.offset);

        this.editorHighlights.innerText = this.editorTextArea.value.slice(0, start);

        const mark = document.createElement('span');
        mark.classList.add('err');

        let markContent = this.editorTextArea.value.slice(start, end);
        if (markContent.length === 0 || markContent.startsWith("\n"))
            markContent = " " + markContent;

        mark.innerText = markContent;
        this.editorHighlights.appendChild(mark);

        this.editorHighlights.append(this.editorTextArea.value.slice(end) + " ");
    }

    read(index) {
        return ((index < 0) ? this.tapeLeft[-index - 1] : this.tapeRight[index]) ?? this.spec.blank;
    }

    write(index, symbol) {
        if (index < 0) {
            if (symbol === this.spec.blank)
                delete this.tapeLeft[-index - 1];
            else
                this.tapeLeft[-index - 1] = symbol;
        } else {
            if (symbol === this.spec.blank)
                delete this.tapeRight[index];
            else
                this.tapeRight[index] = symbol;
        }
    }

    move(m) {
        const mn = parseInt(m);

        if (isNaN(mn) || Math.abs(mn) > 1)
            throw RangeError(`invalid move ${m}`);

        if (mn === 0)
            return;

        this.head += mn;
        this.startTapeMove(mn);
    }

    get headSymbol() {
        return this.read(this.head);
    }

    set headSymbol(symbol) {
        this.write(this.head, symbol);
    }

    get nextStep() {
        return this.transitionMatrix[this.state][this.headSymbol] ?? null;
    }

    get result() {
        return this.nextStep ? 'running...' : (this.spec.outputs[this.state] ?? 'stuck');
    }

    changeState(state, prevTransition = null) {
        if (!state || !(state in this.transitionMatrix))
            return;

        const prevState = this.state;
        prevTransition = prevTransition ?? this.nextStep;

        if (state === prevState && this.nextStep === prevTransition)
            return;

        this.state = state;

        this.updateTableStyle();
        this.updateGraphStyle(prevState, prevTransition);
    }

    stepForward() {
        const step = this.nextStep;

        if (!step) {
            if (this.running) {
                this.pause();
                UIkit.notification("The machine has halted");
            }

            return;
        }

        this.pushToTrace(step);

        const prevTransition = step;
        const headCellIndex = this.head - this.tapeCellBase;

        this.headSymbol = step.write;
        this.tapeRow.children.item(headCellIndex).firstChild.innerText = step.write;
        this.move(step.move);
        this.changeState(step.next, prevTransition);
    }

    stepBackward() {
        if (this.trace.length < 1)
            return;

        const prevTransition = this.nextStep;
        const lastStep = this.popFromTrace();

        this.move(-lastStep.move);
        const headCellIndex = this.head - this.tapeCellBase;

        this.headSymbol = lastStep.read;
        this.tapeRow.children.item(headCellIndex).firstChild.innerText = lastStep.read;
        this.changeState(lastStep.state, prevTransition);
    }

    get running() {
        return this.steppingInterval !== null;
    }

    pause() {
        clearInterval(this.steppingInterval);
        this.steppingInterval = null;
        document.body.classList.remove('running');
    }

    resume() {
        clearInterval(this.steppingInterval);
        this.steppingInterval = setInterval(() => this.stepForward(), this.steppingDelay);
        document.body.classList.add('running');
    }

    update() {
        let spec = null, tm = null;

        try {
            spec = parser.parse(this.editorTextArea.value);
            tm = buildTransitionMatrix(spec);
        } catch (err) {
            this.reportError(err.message, err.location);
            return;
        }

        this.editorErrorContainer.innerHTML = "";
        this.editor.classList.remove('show-error');

        this.pause();

        const prevBlank = this.spec?.blank;

        this.spec = spec;
        this.transitionMatrix = tm;
        this.clearTrace();

        if (prevBlank && prevBlank !== spec.blank) {
            // update tape
            let notify = false;

            this.tapeLeft.forEach((sym, i) => {
                if (sym === this.spec.blank) {
                    notify = true;
                    this.tapeLeft[i] = "?";
                }
            });

            this.tapeRight.forEach((sym, i) => {
                if (sym === this.spec.blank) {
                    notify = true;
                    this.tapeRight[i] = "?";
                }
            });

            if (notify)
                UIkit.notification(`'${this.spec.blank}' is now the blank symbol. Occurrences of '${this.spec.blank}' on tape have been changed to '?'.`);
        }

        // update state
        if (this.state === null || !(this.state in this.transitionMatrix)) {
            if (this.state !== null)
                UIkit.notification("Current state does not exist anymore, reverting to initial state.");

            this.state = this.spec.init;
        }

        this.updateTable();
        this.updateGraph();
        this.updateTape();
    }

    updateTable() {
        let symbols = [];
        let symbolSet = {};

        symbolSet[this.spec.blank] = 1;

        this.tapeLeft.forEach(sym => {
            if (sym && !(sym in symbolSet)) {
                symbolSet[sym] = 1;
                symbols.push(sym);
            }
        });

        this.tapeRight.forEach(sym => {
            if (sym && !(sym in symbolSet)) {
                symbolSet[sym] = 1;
                symbols.push(sym);
            }
        });

        for (const t of this.spec.table) {
            if (t.read && !(t.read in symbolSet)) {
                symbolSet[t.read] = 1;
                symbols.push(t.read);
            }

            if (t.write && !(t.write in symbolSet)) {
                symbolSet[t.write] = 1;
                symbols.push(t.write);
            }
        }

        symbols.sort();
        symbols.unshift(this.spec.blank);
        symbolSet = null;

        this.tableView.innerHTML = Mustache.render(TABLE, {
            symbols: symbols,
            states: topoSortStates(this.spec.init, this.transitionMatrix).map(state => ({
                label: state,
                init: state === this.spec.init,
                output: this.spec.outputs[state],
                transitions: symbols.map(sym =>
                    (this.transitionMatrix[state][sym]?.tableEntry ?? { read: sym, halt: true }))
            }))
        });

        this.updateTableStyle();
    }

    updateTableStyle() {
        const headSymbol = this.headSymbol;

        for (const cell of this.tableView.querySelectorAll('th.symbol'))
            cell.classList.toggle('active', cell.dataset.read === headSymbol);

        for (const cell of this.tableView.querySelectorAll('th.state'))
            cell.classList.toggle('active', cell.dataset.state === this.state);

        for (const cell of this.tableView.querySelectorAll('td.transition'))
            cell.classList.toggle('active', cell.dataset.state === this.state && cell.dataset.read === headSymbol);
    }

    updateGraph() {
        const prevStates = this.prevStates ?? [];
        const states = Object.keys(this.transitionMatrix).sort();
        this.prevStates = states.slice();

        let changed = [];
        let removed = [];

        while (prevStates.length > 0 && states.length > 0) {
            if (prevStates[prevStates.length - 1] < states[states.length - 1]) {
                changed.push(states.pop());
            } else if (prevStates[prevStates.length - 1] > states[states.length - 1]) {
                removed.push(prevStates.pop());
            } else {
                changed.push(states.pop());
                prevStates.pop();
            }
        }

        for (const state of states)
            changed.push(state);

        for (const state of prevStates)
            removed.push(state);

        changed.forEach((state, i) => {
            changed[i] = {
                id: state,
                label: state,
                group: this.spec.outputs[state] ?? 'normal',
                borderWidth: 1,
                borderWidthSelected: 1
            };
        });

        changed.push({ id: 'init', group: 'init' });

        const prevEdges = this.prevEdges ?? [];
        const edgeMap = {};

        for (const ts of Object.values(this.transitionMatrix)) {
            for (const t of Object.values(ts)) {
                const edgeId = `${t.state} ${t.next}`;

                if (!(edgeId in edgeMap)) {
                    edgeMap[edgeId] = {
                        from: t.state,
                        to: t.next,
                        node: {
                            id: edgeId,
                            label: "",
                            group: 'transition',
                            transitions: []
                        }
                    };
                }

                edgeMap[edgeId].node.transitions.push(t);
            }
        }

        const edges = Object.keys(edgeMap).sort();
        this.prevEdges = edges.slice();

        const headSymbol = this.headSymbol;

        for (const e of edges) {
            edgeMap[e].node.label = edgeMap[e].node.transitions.map(t =>
                `${t.read}↦${t.write} ${MOVE_NAME[t.move]}`).join("\n");
        }

        let changedEdges = [ { id: 'init', from: 'init', to: this.spec.init } ];
        let removedEdges = [];

        while (prevEdges.length > 0 && edges.length > 0) {
            if (prevEdges[prevEdges.length - 1] < edges[edges.length - 1]) {
                const {from, to, node} = edgeMap[edges.pop()];
                const edgeId = node.id;
                changed.push(node);
                changedEdges.push(
                    Object.assign(
                        { id: `${edgeId} out`, arrows: '', from: from, to: edgeId, width: 1 },
                        (from !== to) ? {} : LOOP),
                    Object.assign(
                        { id: `${edgeId} in`, from: edgeId, to: to, width: 1 },
                        (from !== to) ? {} : LOOP));
            } else if (prevEdges[prevEdges.length - 1] > edges[edges.length - 1]) {
                const edgeId = prevEdges.pop();
                removed.push(edgeId);
                removedEdges.push(`${edgeId} out`, `${edgeId} in`);
            } else {
                const edgeId = edges.pop(), {label, transitions} = edgeMap[edgeId].node;
                changed.push({ id: edgeId, label: label, transitions: transitions });
                prevEdges.pop();
                changedEdges.push(
                    { id: `${edgeId} out`, width: 1 },
                    { id: `${edgeId} in`, width: 1 });
            }
        }

        for (const edgeId of edges) {
            const {from, to, node} = edgeMap[edgeId];
            changed.push(node);
            changedEdges.push(
                Object.assign(
                    { id: `${edgeId} out`, arrows: '', from: from, to: edgeId, width: 1 },
                    (from !== to) ? {} : LOOP),
                Object.assign(
                    { id: `${edgeId} in`, from: edgeId, to: to, width: 1 },
                    (from !== to) ? {} : LOOP));
        }

        for (const edgeId of prevEdges) {
            removed.push(edgeId);
            removedEdges.push(`${edgeId} out`, `${edgeId} in`);
        }

        this.nodes.remove(removed);
        this.nodes.update(changed);
        this.edges.remove(removedEdges);
        this.edges.update(changedEdges);

        this.updateGraphStyle(null, null);

        this.graph.fit();
    }

    updateGraphStyle(prevState, prevTransition) {
        const nextTransition = this.nextStep;

        if (this.state === prevState && nextTransition === prevTransition)
            return;

        const prevEdgeId = prevTransition ? `${prevTransition.state} ${prevTransition.next}` : null;
        const nextEdgeId = nextTransition ? `${nextTransition.state} ${nextTransition.next}` : null;

        const prevEdgeNode = prevTransition ? this.nodes.get(prevEdgeId) : null;
        const nextEdgeNode = nextEdgeId === prevEdgeId ? prevEdgeNode : (nextTransition ? this.nodes.get(nextEdgeId) : null);

        const changedNodes = [];
        const changedEdges = [];

        if (this.state !== prevState) {
            if (prevState) {
                changedNodes.push({
                    id: prevState,
                    label: prevState,
                    borderWidth: 1,
                    borderWidthSelected: 1
                });
            }

            changedNodes.push({
                id: this.state,
                label: `<b>${this.state}</b>`,
                borderWidth: 3,
                borderWidthSelected: 3
            });
        }

        if (nextEdgeNode !== prevEdgeNode) {
            if (prevEdgeNode) {
                changedNodes.push({
                    id: prevEdgeId,
                    label: prevEdgeNode.transitions.map(t =>
                        `${t.read}↦${t.write} ${MOVE_NAME[t.move]}`).join("\n")
                });

                changedEdges.push(
                    { id: `${prevEdgeId} out`, width: 1 },
                    { id: `${prevEdgeId} in`, width: 1 });
            }

            if (nextEdgeNode) {
                changedEdges.push(
                    { id: `${nextEdgeId} out`, width: 2 },
                    { id: `${nextEdgeId} in`, width: 2 });
            }
        }

        if (nextEdgeNode) {
            const headSymbol = this.headSymbol;

            changedNodes.push({
                id: nextEdgeId,
                label: nextEdgeNode.transitions.map(t =>
                    (t.state === this.state && t.read === headSymbol)
                        ? `<b>${t.read}↦${t.write} ${MOVE_NAME[t.move]}</b>`
                        : `${t.read}↦${t.write} ${MOVE_NAME[t.move]}`
                ).join("\n")
            });
        }

        this.nodes.update(changedNodes);
        this.edges.update(changedEdges);
    }

    pushToTrace(step) {
        this.trace.push(step);

        if (this.trace.length === 1)
            this.traceTable.innerHTML = "";

        const row = document.createElement('tr');
        row.innerHTML = Mustache.render(TRACE_ROW, {
            __proto__: step,
            move: MOVE_NAME[step.move]
        });
        this.traceTable.appendChild(row);

        if (this.traceView.matches('.uk-active'))
            row.scrollIntoView(false);
    }

    popFromTrace() {
        const step = this.trace.pop();

        if (this.trace.length <= 0)
            this.traceTable.innerHTML = TRACE_EMPTY;
        else
            this.traceTable.removeChild(this.traceTable.lastChild);

        return step;
    }

    clearTrace() {
        this.trace = [];
        this.traceTable.innerHTML = TRACE_EMPTY;
    }

    updateTape(resize = false) {
        const tapeCellCount = Math.max(5, 1 + 2*(Math.floor(((this.tape.clientWidth/2) - 16)/32) + 2));

        if (resize && tapeCellCount <= this.tapeRow.childElementCount)
            return;

        this.tapeCellBase = this.head - (tapeCellCount - 1)/2;

        this.tapeRow.innerHTML = "";

        for (let i = 0; i < tapeCellCount; ++i) {
            const td = document.createElement('td')
            const span = document.createElement('span');
            span.innerText = this.read(this.tapeCellBase + i);
            td.appendChild(span);
            this.tapeRow.appendChild(td);
        }
    }

    startTapeMove(m) {
        if (m !== L && m !== R)
            return;

        if (this.ongoingTapeMove)
            this.endTapeMove();

        this.ongoingTapeMove = m;

        this.tape.classList.toggle('step-left', m === L);
        this.tape.classList.toggle('step-right', m === R);

        // restart animation
        this.tapeTable.style.animation = 'none';
        const oh = this.tapeTable.offsetHeight;
        this.tapeTable.style.animation = '';
    }

    endTapeMove() {
        if (!this.ongoingTapeMove)
            return;

        this.tape.classList.remove('step-left', 'step-right');

        this.tapeCellBase += this.ongoingTapeMove

        if (this.ongoingTapeMove === L) {
            const movedCell = this.tapeRow.lastChild;

            movedCell.remove();
            movedCell.firstChild.innerText = this.read(this.tapeCellBase);
            this.tapeRow.prepend(movedCell);
        } else {
            const tapeCellCount = this.tapeRow.childElementCount;
            const movedCell = this.tapeRow.firstChild;

            movedCell.remove();
            movedCell.firstChild.innerText = this.read(this.tapeCellBase + tapeCellCount - 1);
            this.tapeRow.appendChild(movedCell);
        }

        this.ongoingTapeMove = null;
    }

    queueUpdate() {
        clearTimeout(this.updateTimeout);
        this.updateTimeout = setTimeout(() => this.update(), 500);
    }

    async perform(action) {
        let prevTransition = this.nextStep;

        switch (action) {
            case "load":
                const file = await selectFile("text/*", false);
                if (file) {
                    try {
                        this.editorTextArea.value = this.editorHighlights.innerText = await file.text();
                    } catch (err) {
                        window.alert(`Could not load '${file.name}': ${err.message ?? err.name ?? err}`);
                        return;
                    }

                    this.update();
                }
                return;

            case "save":
                const blob = new Blob([this.editorTextArea.value], {type: "text/plain;charset=utf-8"});
                FileSaver.saveAs(blob, "TuringMachineSpec.txt");
                return;

            case "edit":
                document.body.classList.toggle('hide-editor');
                this.editorTextArea.disabled = !this.editorTextArea.disabled;
                return;

            case "left":
                this.move(L);
                this.updateTableStyle();
                this.updateGraphStyle(this.state, prevTransition);
                break;

            case "right":
                this.move(R);
                this.updateTableStyle();
                this.updateGraphStyle(this.state, prevTransition);
                break;

            case "pause-resume":
                if (!this.running) {
                    this.resume();
                    return;
                }

                break;

            case "reset":
            case "stop":
                this.clearTrace();
                this.changeState(this.spec.init);

                if (action === "stop")
                    break;
                else
                    prevTransition = this.nextStep;

                // fallthrough
            case "home":
                this.head = 0;

                if (action === "home") {
                    this.updateTableStyle();
                    this.updateGraphStyle(this.state, prevTransition);
                    this.updateTape();
                    break;
                }

                // fallthrough
            case "clear":
                this.tapeLeft = [];
                this.tapeRight = [];
                this.updateTableStyle();
                this.updateGraphStyle(this.state, prevTransition);
                this.updateTape();
                break;

            case "backward":
                this.stepBackward();
                break;

            case "forward":
                this.stepForward();
                break;

            default:
                return;
        }

        this.pause();
    }

    start() {
        if (this.started)
            return;

        this.started = true;

        document.onclick = ev => {
            if (ev.target.dataset.action) {
                ev.stopPropagation();
                ev.preventDefault();
                this.perform(ev.target.dataset.action);
            }
        };

        this.steppingDelaySelector = document.getElementById('stepping-delay');
        this.steppingDelaySelector.onchange = () => {
            const newDelay = parseInt(this.steppingDelaySelector.value);
            if (isNaN(newDelay))
                return;

            this.steppingDelay = newDelay;
            if (this.running)
                this.resume();
        };

        this.steppingDelaySelector.dispatchEvent('change');

        this.graphView = document.getElementById('graph-view');
        this.tableView = document.getElementById('table-view');
        this.traceView = document.getElementById('trace-view');

        this.nodes = new DataSet([]);
        this.edges = new DataSet([]);

        this.graph = new Network(this.graphView, {
            nodes: this.nodes,
            edges: this.edges
        }, {
            nodes: {
                labelHighlightBold: false,
                shape: 'box',
            },
            edges: {
                arrows: {
                    to: {
                        enabled: true,
                        scaleFactor: 0.5
                    }
                },
                arrowStrikethrough: false,
                length: 50,
                labelHighlightBold: false,
                selectionWidth: 0,
                smooth: false
            },
            groups: {
                init: {
                    shape: 'circle',
                    margin: 1,
                    borderWidth: 0,
                    borderWidthSelected: 0,
                    color: {
                        border: '#000',
                        background: '#000',
                        highlight: {
                            border: '#000',
                            background: '#000',
                        }
                    },
                },
                normal: {
                    heightConstraint: {
                        minimum: 30
                    },
                    widthConstraint: {
                        minimum: 30
                    },
                    shapeProperties: {
                        borderRadius: 30
                    },
                    color: {
                        border: '#000',
                        background: '#fff',
                        highlight: {
                            border: '#000',
                            background: '#fff',
                        }
                    },
                    font: {
                        size: 14,
                        face: "Consolas, Monaco, Courier, 'Courier New', monospace",
                        color: '#000',
                        multi: 'html'
                    }
                },
                accept: {
                    heightConstraint: {
                        minimum: 30
                    },
                    widthConstraint: {
                        minimum: 30
                    },
                    shapeProperties: {
                        borderRadius: 30
                    },
                    color: {
                        border: '#080',
                        background: '#fff',
                        highlight: {
                            border: '#080',
                            background: '#fff',
                        }
                    },
                    font: {
                        size: 14,
                        face: "Consolas, Monaco, Courier, 'Courier New', monospace",
                        color: '#080',
                        multi: 'html'
                    }
                },
                reject: {
                    heightConstraint: {
                        minimum: 30
                    },
                    widthConstraint: {
                        minimum: 30
                    },
                    shapeProperties: {
                        borderRadius: 30
                    },
                    color: {
                        border: '#a00',
                        background: '#fff',
                        highlight: {
                            border: '#a00',
                            background: '#fff',
                        }
                    },
                    font: {
                        size: 14,
                        face: "Consolas, Monaco, Courier, 'Courier New', monospace",
                        color: '#a00',
                        multi: 'html'
                    }
                },
                transition: {
                    mass: 2,
                    margin: 1,
                    borderWidth: 0,
                    borderWidthSelected: 0,
                    shapeProperties: {
                        borderRadius: 0
                    },
                    color: {
                        border: '#000',
                        background: '#fff',
                        highlight: {
                            border: '#000',
                            background: '#fff',
                        }
                    },
                    font: {
                        size: 14,
                        face: "Consolas, Monaco, Courier, 'Courier New', monospace",
                        color: '#000',
                        multi: 'html'
                    }
                }
            }
        });

        this.graph.on('doubleClick', ev => {
            this.clearTrace();
            this.changeState(ev.nodes[0] === 'init' ? this.spec.init : ev.nodes[0]);
        });

        this.tableView.ondblclick = ev => {
            const stateCell = ev.target.closest('th.state');

            if (!stateCell)
                return;

            ev.stopPropagation();
            ev.preventDefault();

            this.changeState(stateCell.dataset.state);
        }

        this.traceTable = this.traceView.querySelector('tbody');

        this.editor = document.getElementById('editor');
        this.editorErrorContainer = this.editor.querySelector('.error-container');
        this.editorHighlights = this.editor.querySelector('.highlights');
        this.editorTextArea = this.editor.querySelector('textarea');

        this.editorTextArea.oninput = ev => {
            this.editor.classList.remove('show-error');
            this.editorHighlights.innerText = this.editorTextArea.value + " ";
            this.queueUpdate();
        };

        this.tape = document.getElementById('tape')
        this.tapeTable = this.tape.querySelector('table');
        this.tapeRow = this.tape.querySelector('tr');
        this.tapeHead = tape.querySelector('.head');

        this.tapeTable.onanimationend = () => this.endTapeMove();

        this.tapeTable.ondblclick = ev => {
            const cell = ev.target.closest('td');

            if (!cell)
                return;

            const cellIndex = Array.prototype.indexOf.call(this.tapeRow.childNodes, cell);

            if (cellIndex < 0)
                return;

            ev.stopPropagation();
            ev.preventDefault();

            const prevTransition = this.nextStep;

            this.head = this.tapeCellBase + cellIndex;

            this.updateTableStyle();
            this.updateGraphStyle(this.state, prevTransition);
            this.updateTape();

            this.tapeHead.focus();
        };

        this.tapeHead.addEventListener('beforeinput', ev => {
            if (ev.inputType === 'insertCompositionText')
                return;

            ev.stopPropagation();
            ev.preventDefault();

            if (!INSERT_OP.test(ev.inputType))
                return;

            const prevTransition = this.nextStep;
            const headCellIndex = this.head - this.tapeCellBase;

            const text = (ev.data ?? ev.dataTransfer?.getData('text/plain'));
            if (!text)
                return;

            const iter = new CLDR.BreakIterator();
            iter.eachGraphemeCluster(text, symbol => {
                if (symbol === " ")
                    symbol = this.spec.blank;

                if (WS.test(symbol))
                    return;

                this.headSymbol = symbol;
                this.tapeRow.children.item(headCellIndex).firstChild.innerText = symbol;
                this.move(R);
            });

            this.updateTableStyle();
            this.updateGraphStyle(this.state, prevTransition);
        });

        this.tapeHead.onkeydown = ev => {
            const prevTransition = this.nextStep;
            const headCellIndex = this.head - this.tapeCellBase;

            switch (ev.key) {
                case "Escape":
                    this.tapeHead.blur();
                    return;
                case "Backspace":
                case "Delete":
                    this.headSymbol = this.spec.blank;
                    this.tapeRow.children.item(headCellIndex).firstChild.innerText = this.spec.blank;
                    this.move((ev.key === "Backspace") ? L : R);
                    break;
                case "ArrowLeft":
                    this.move(L);
                    break;
                case "ArrowRight":
                    this.move(R);
                    break;
                case "Enter":
                case "Home":
                    if (this.head === 0)
                        return;

                    this.head = 0;
                    this.updateTape();
                    break;
                default:
                    return;
            }

            this.updateTableStyle();
            this.updateGraphStyle(this.state, prevTransition);
        };

        const init = () => {
            const prev = this.editorTextArea.value;

            this.editorTextArea.value = "init halt\nblank *\n";
            this.editorHighlights.innerText = this.editorTextArea.value + " ";
            this.update();

            if (prev) {
                this.state = null;
                this.editorTextArea.value = prev;
                this.editorHighlights.innerText = this.editorTextArea.value + " ";
                this.update();
            }

            this.tapeResizeObserver = new ResizeObserver(() => this.updateTape(true));
            this.tapeResizeObserver.observe(this.tape);
        }

        if (document.readyState === 'complete') {
            init();
        } else {
            window.onload = init;
        }
    }
}

const app = new App();

if (document.readyState !== 'loading') {
    app.start();
} else {
    document.onreadystatechange = () => {
        if (document.readyState !== 'loading')
            app.start();
    };
}
