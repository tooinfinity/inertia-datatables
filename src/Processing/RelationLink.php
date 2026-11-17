<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing;

/**
 * Value object describing how a related model is linked to its parent.
 *
 * @internal
 */
final readonly class RelationLink
{
    public function __construct(
        public string $relatedTable,
        public string $relatedColumn,
        public string $relatedKey,
        public string $parentTable,
        public string $parentKey,
    ) {}
}
