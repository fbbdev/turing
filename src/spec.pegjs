Machine
  = __ "init" _ init:State
    _? NL __ "blank" _ blank:Symbol
    outputs:Outputs
    table:Table
    __
    {
      let outputMap = {}
      for (const {state, output, loc} of outputs) {
        if (state in outputMap)
          error(`more than one output specified for state ${state}`, loc);
        else
          outputMap[state] = output;
      }
      return { init: init, blank: blank, outputs: outputMap, table: table }
    }

Outputs
  = ( _? NL __ o:Output { return o; } )*

Output
  = output:("accept" / "reject") _ state:State
    {
      return { output: output, state: state, loc: location() };
    }

Table
  = ( _? NL __ t:Transition { return t; } )*

Transition
  = state:State _ read:Symbol _ write:Symbol _ move:Move _ next:State
    {
      return { state: state, read: read, write: write, move: move, next: next, loc: location() };
    }

State "state"
  = label:($ [^ \f\v\t\r\n]+)
    {
      if (["init", "blank", "accept", "reject"].includes(label))
        error(`'${label}' is a reserved keyword and cannot be used as a state name`);

      return label;
    }

Symbol "symbol"
  = [^ \f\v\t\r\n]

Move "move"
  = [LRN]

_ "whitespace"
  = [ \f\t]+

NL "newline"
  = [\r\n]+

__ "whitespace"
  = [ \f\v\t\r\n]*
