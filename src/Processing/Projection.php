<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing;

use Illuminate\Contracts\Database\Query\Expression as ExpressionContract;
use Illuminate\Database\Query\Builder as QueryBuilder;

/**
 * Parses and matches SQL SELECT-list projections for the stable-ordering logic.
 *
 * @internal
 */
final readonly class Projection
{
    /**
     * Resolve the individual select items of a projection.
     *
     * Raw projections may contain multiple comma-separated items, while plain
     * projections always describe a single item.
     *
     * @return array<int, array{source: string, alias: string|null}>
     */
    public function items(QueryBuilder $queryBuilder): array
    {
        $columns = $queryBuilder->columns;

        if ($columns === null) {
            return [];
        }

        $items = [];

        foreach ($columns as $column) {
            if ($column instanceof ExpressionContract) {
                $value = (string) $column->getValue($queryBuilder->getGrammar());

                foreach ($this->splitList($value) as $part) {
                    [$source, $alias] = $this->parse($part);

                    $items[] = ['source' => $source, 'alias' => $alias];
                }

                continue;
            }

            [$source, $alias] = $this->parse($column);

            $items[] = ['source' => $source, 'alias' => $alias];
        }

        return $items;
    }

    /**
     * Split a raw projection into its individual select items.
     *
     * @return array<int, string>
     */
    public function splitList(string $projection): array
    {
        $items = [];
        $current = '';
        $depth = 0;
        $quote = null;
        $comment = null;
        $length = strlen($projection);

        for ($index = 0; $index < $length; $index++) {
            $character = $projection[$index];

            if ($quote !== null) {
                $current .= $character;

                if ($character === '\\' && $quote !== '`' && $index + 1 < $length) {
                    $index++;
                    $current .= $projection[$index];

                    continue;
                }

                if ($character === $quote) {
                    if ($index + 1 < $length && $projection[$index + 1] === $quote) {
                        $index++;
                        $current .= $projection[$index];

                        continue;
                    }

                    $quote = null;
                }

                continue;
            }

            if ($comment === 'block') {
                $current .= $character;

                if ($character === '*' && $index + 1 < $length && $projection[$index + 1] === '/') {
                    $index++;
                    $current .= $projection[$index];
                    $comment = null;
                }

                continue;
            }

            if ($comment === 'line') {
                $current .= $character;

                if ($character === "\n" || $character === "\r") {
                    $comment = null;
                }

                continue;
            }

            if ($character === '/' && $index + 1 < $length && $projection[$index + 1] === '*') {
                $comment = 'block';
                $current .= '/*';
                $index++;

                continue;
            }

            if (($character === '-' && $index + 1 < $length && $projection[$index + 1] === '-') || $character === '#') {
                $comment = 'line';
                $current .= $character;

                if ($character === '-') {
                    $index++;
                    $current .= '-';
                }

                continue;
            }

            if (in_array($character, ["'", '"', '`'], true)) {
                $quote = $character;
                $current .= $character;

                continue;
            }

            if ($character === '(') {
                $depth++;
            } elseif ($character === ')') {
                $depth--;
            } elseif ($character === ',' && $depth === 0) {
                $items[] = $current;
                $current = '';

                continue;
            }

            $current .= $character;
        }

        $items[] = $current;

        return array_values(array_filter(
            array_map(trim(...), $items),
            fn (string $item): bool => $item !== '',
        ));
    }

    /**
     * Parse a projected expression and its optional alias.
     *
     * @return array{0: string, 1: string|null}
     */
    public function parse(string $value): array
    {
        $value = trim($value);

        $pattern = '/^(.*?)\s+as\s+(?:"(?<quoted>[^"]+)"|`(?<ticked>[^`]+)`|(?<plain>[a-z_][a-z0-9_]*))$/i';

        if (preg_match($pattern, $value, $matches, PREG_UNMATCHED_AS_NULL) !== 1) {
            return [$value, null];
        }

        $alias = $matches['quoted'] ?? $matches['ticked'] ?? $matches['plain'] ?? null;

        return [trim($matches[1]), $alias];
    }

    /**
     * Normalize a SQL identifier by stripping quotes and lowercasing.
     */
    public function normalizeIdentifier(string $identifier): string
    {
        return strtolower(str_replace(['`', '"'], '', trim($identifier)));
    }

    /**
     * Determine whether a projection selects every column of the base table.
     */
    public function isBaseWildcard(string $projection, ?string $qualifier): bool
    {
        $projection = $this->normalizeIdentifier($projection);

        if ($projection === '*') {
            return true;
        }

        if ($qualifier === null) {
            return false;
        }

        return $projection === strtolower($qualifier).'.*';
    }

    /**
     * Determine whether a projection selects the given row key.
     */
    public function matchesKey(string $projection, string $keyName, ?string $qualifier): bool
    {
        $projection = $this->normalizeIdentifier($projection);

        if ($projection === strtolower($keyName)) {
            return true;
        }

        return $qualifier !== null
            && $projection === strtolower($qualifier).'.'.strtolower($keyName);
    }

    /**
     * Determine whether a projection selects the given grouping column.
     */
    public function matchesGroup(string $projection, string $group, ?string $qualifier): bool
    {
        $projection = $this->normalizeIdentifier($projection);
        $group = $this->normalizeIdentifier($group);

        if ($projection === $group) {
            return true;
        }

        $projectionParts = explode('.', $projection);
        $groupParts = explode('.', $group);

        $projectionColumn = $projectionParts[count($projectionParts) - 1];
        $groupColumn = $groupParts[count($groupParts) - 1];

        if ($projectionColumn !== $groupColumn) {
            return false;
        }

        $projectionTable = count($projectionParts) > 1 ? $projectionParts[count($projectionParts) - 2] : null;
        $groupTable = count($groupParts) > 1 ? $groupParts[count($groupParts) - 2] : null;

        if ($projectionTable !== null && $groupTable !== null) {
            return $projectionTable === $groupTable;
        }

        $baseTable = $qualifier === null ? null : strtolower($qualifier);

        return $projectionTable === $baseTable || $groupTable === $baseTable;
    }

    /**
     * Determine whether the projection selects the given row key.
     */
    public function includesKey(QueryBuilder $queryBuilder, string $keyName, string $qualifier): bool
    {
        return array_any($this->items($queryBuilder), fn (array $item): bool => $this->matchesKey($item['source'], $keyName, $qualifier));
    }

    /**
     * Determine whether the projection only contains aggregate expressions.
     *
     * Aggregate-only queries do not represent rows and therefore cannot be
     * ordered by a row key.
     */
    public function isAggregateOnly(QueryBuilder $queryBuilder): bool
    {
        $columns = $queryBuilder->columns;

        if ($columns === null || $columns === []) {
            return false;
        }

        $items = $this->items($queryBuilder);

        if ($items === []) {
            return false;
        }

        return array_all($items, fn (array $item): bool => $this->isAggregateExpression($item['source']));
    }

    /**
     * Determine whether a projected expression aggregates rows.
     */
    public function isAggregateExpression(string $source): bool
    {
        // Strip string literals and comments so literal text is not mistaken for function calls.
        $stripped = preg_replace("/'(''|\\\\'|[^'])*'/s", "''", $source) ?? $source;
        $stripped = preg_replace('/\/\*.*?\*\//s', '', $stripped) ?? $stripped;
        $stripped = preg_replace('/--.*?$/m', '', $stripped) ?? $stripped;

        if (preg_match('/\bover\s*\(/i', $stripped) === 1) {
            return false;
        }

        $aggregates = 'array_agg|avg|bit_and|bit_or|bool_and|bool_or|count|every|group_concat|json_agg|json_arrayagg|json_group_array|jsonb_agg|jsonb_arrayagg|max|min|mode|percentile_cont|percentile_disc|stddev|stddev_pop|stddev_samp|string_agg|sum|total|var_pop|var_samp|variance|xmlagg|[a-z_]+_agg(?:reg)?';

        return preg_match('/\b(?:'.$aggregates.')\s*\(/i', $stripped) === 1;
    }

    /**
     * Resolve the table name or alias used by the query.
     */
    public function tableQualifier(QueryBuilder $queryBuilder): ?string
    {
        $from = $queryBuilder->from;

        if (! is_string($from)) {
            return null;
        }

        $from = trim($from);

        if ($from === '') {
            return null;
        }

        if (preg_match('/^(.*?)\s+(?:as\s+)?([^\s]+)$/i', $from, $matches) === 1) {
            return trim($matches[2], '`"');
        }

        $segments = explode('.', $from);
        $table = $segments[array_key_last($segments)];

        return trim($table, '`"');
    }

    /**
     * Resolve the table the query reads from, without its alias.
     */
    public function baseTable(mixed $from): ?string
    {
        if (! is_string($from)) {
            return null;
        }

        $from = trim($from);

        if ($from === '') {
            return null;
        }

        if (preg_match('/^(.*?)\s+(?:as\s+)?([^\s]+)$/i', $from, $matches) === 1) {
            return trim($matches[1], '`"');
        }

        return $from;
    }

    /**
     * Determine whether two table names refer to the same table.
     */
    public function sameTable(string $first, string $second): bool
    {
        return $this->tableName($first) === $this->tableName($second);
    }

    /**
     * Resolve the name of a table without its schema.
     */
    public function tableName(string $table): string
    {
        $segments = explode('.', $table);
        $name = $segments[array_key_last($segments)];

        return strtolower(trim($name, '`"'));
    }

    /**
     * Find the row key in a selected projection.
     *
     * @return array{column: string, equivalents: array<int, string>}|null
     */
    public function findProjectedKey(
        QueryBuilder $queryBuilder,
        string $keyName,
        ?string $qualifier,
        string $wildcardKey,
    ): ?array {
        $columns = $queryBuilder->columns;

        if ($columns === null) {
            return $this->tiebreakerCandidate($wildcardKey, $keyName, $qualifier);
        }

        foreach ($this->items($queryBuilder) as $item) {
            if ($this->isBaseWildcard($item['source'], $qualifier)) {
                return $this->tiebreakerCandidate($wildcardKey, $keyName, $qualifier);
            }

            if (! $this->matchesKey($item['source'], $keyName, $qualifier)) {
                continue;
            }

            $projectedKey = $item['alias'] ?? $item['source'];

            return $this->tiebreakerCandidate($projectedKey, $keyName, $qualifier, $item['source']);
        }

        return null;
    }

    /**
     * Find the name of the row key in the output of a union.
     */
    public function findProjectedKeyOutput(
        QueryBuilder $queryBuilder,
        string $keyName,
        ?string $qualifier,
    ): ?string {
        $columns = $queryBuilder->columns;

        if ($columns === null) {
            return $keyName;
        }

        foreach ($this->items($queryBuilder) as $item) {
            if ($this->isBaseWildcard($item['source'], $qualifier)) {
                return $keyName;
            }

            if (! $this->matchesKey($item['source'], $keyName, $qualifier)) {
                continue;
            }

            return $item['alias'] ?? $keyName;
        }

        return null;
    }

    /**
     * Find the grouping column in the projection of a distinct query.
     *
     * Distinct queries may only be ordered by expressions that are projected,
     * so the projected expression is used instead of the grouping column.
     *
     * @return array{column: string, equivalents: array<int, string>}|null
     */
    public function findProjectedGroup(
        QueryBuilder $queryBuilder,
        string $group,
        ?string $qualifier,
    ): ?array {
        foreach ($this->items($queryBuilder) as $item) {
            if ($this->isBaseWildcard($item['source'], $qualifier)) {
                return ['column' => $group, 'equivalents' => [$group]];
            }

            if (! $this->matchesGroup($item['source'], $group, $qualifier)) {
                continue;
            }

            $column = $item['alias'] ?? $item['source'];

            return [
                'column' => $column,
                'equivalents' => array_values(array_unique([$column, $group, $item['source']])),
            ];
        }

        return null;
    }

    /**
     * Build a tiebreaker candidate and the equivalent columns that prevent duplication.
     *
     * @return array{column: string, equivalents: array<int, string>}
     */
    public function tiebreakerCandidate(
        string $column,
        string $keyName,
        ?string $qualifier,
        string ...$additionalEquivalents
    ): array {
        $equivalents = [$column, $keyName, ...$additionalEquivalents];

        if ($qualifier !== null) {
            $equivalents[] = $qualifier.'.'.$keyName;
        }

        return [
            'column' => $column,
            'equivalents' => array_values(array_unique($equivalents)),
        ];
    }
}
