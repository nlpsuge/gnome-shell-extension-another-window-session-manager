'use strict';

var States = {

    // x, y
    POSITION:                   1 << 0,
    // width, height
    SIZE:                       1 << 1,

    STICKY:                     1 << 2,
    ABOVE:                      1 << 3,

    MAXIMIZATION_NO:            1 << 4,
    MAXIMIZATION_HORIZONTAL:    1 << 5,
    MAXIMIZATION_VERTICAL:      1 << 6,
    MINIMIZATION:               1 << 7,

    WINDOW_WORKSPACE:           1 << 8,

    TILING:                     1 << 9,

    ON_PRIMARY_MONITOR:         1 << 10,
    MONITOR:                    1 << 11,

    FULLSCREEN:                 1 << 12,

    // The currently window is actived or focused
    FOCUSED:                    1 << 13,

    ACTIVE_WORKSPACE:           1 << 14,

    ACTIVE_WINDOW:              1 << 15,

}

/**
 * All states covering all states defined in `States`.
 */
var ALL_STATES = (
    States.POSITION                    |   States.SIZE                        | 
    States.STICKY                      |   States.ABOVE                       | 
    States.MAXIMIZATION_NO             |   States.MAXIMIZATION_HORIZONTAL     | 
    States.MAXIMIZATION_VERTICAL       |   States.MINIMIZATION                |
    States.WINDOW_WORKSPACE                   |   States.TILING                      |
    States.ON_PRIMARY_MONITOR          |   States.MONITOR                     |
    States.FULLSCREEN                  |   States.FOCUSED                     |
    States.ACTIVE_WORKSPACE
);

