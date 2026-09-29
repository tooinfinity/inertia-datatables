<?php

declare(strict_types=1);

return [
    'default_per_page' => 25,

    'max_per_page' => 100,

    'per_page_options' => [
        10,
        25,
        50,
        100,
    ],

    'search' => [
        'debounce' => 300,
    ],

    'query' => [
        'page' => 'page',
        'per_page' => 'per_page',
        'search' => 'search',
        'sort' => 'sort',
        'filters' => 'filters',
    ],
];
