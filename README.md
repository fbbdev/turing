# Turing machine visualizer and analyzer

[![Build and deploy](https://github.com/fbbdev/turing/actions/workflows/webpack.yml/badge.svg)](https://github.com/fbbdev/turing/actions/workflows/webpack.yml)

Teachers and tutors of theoretical computer science courses often face the dual
problem of *(a)* helping novice students to become acquainted with the somewhat
counterintuitive discipline of Turing machine design and interpretation, and on
the other hand *(b)* interpreting and assessing their students' output which
— due to the aforementioned lack of intuition — can often get quite convoluted
itself.

This project is an attempt at developing tools that may help solve both sides
of the problem; first, by providing a graphical environment in which the
structure and behavior of machine designs can be visualized and explored
intuitively; second, by providing tools for assisted (and eventually automated)
analysis of their behavior in terms of a higher level description language.

It grew out of dissatisfaction with the tools already available on the internet,
which are either too inflexible (i.e. limited in their functionality) or sport
outdated and/or uncomfortable user interfaces.

## Web demo

This is a web-based application. A demo is available
[here](https://fbbdev.it/turing/).
For a guide to the [description language](#description-language) and some
[examples](#examples), see below.

Here is a screenshot of the main view (state diagram):

![A screenshot of the diagram view](screenshot.png)

## Roadmap

At present, only the first part of the project is almost fully developed and
already quite usable. It takes as input a low level textual description of a
Turing machine and provides an interactive visualization of the state
transition diagram and table, together with a tape editor and navigator and
tools for running the program. There is still room for improvement, for example
by adding a suite of keyboard shortcuts, graphical editing tools and code
navigation utilities.

Eventually, a high-level description language will be implemented together with
tools for reverse-engineering a high-level description from a low-level one.
Ideally, when a high-level description is available the application should be
able to extract hints for an improved visualization.

**TODO:** detailed roadmap.

## GUI and keyboard shortcuts

## Description language

## Examples

## Acknowledgements

## License

Copyright (C) 2023 Fabio Massaioli

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
