<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Http;

use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use TooInfinity\InertiaDataTables\Exceptions\InvalidColumnException;
use TooInfinity\InertiaDataTables\Exceptions\InvalidFilterException;
use TooInfinity\InertiaDataTables\Exceptions\InvalidSortException;

/**
 * Trait to handle InertiaDataTables exceptions with proper HTTP status codes.
 *
 * Usage in your app/Exceptions/Handler.php:
 *
 * ```php
 * use TooInfinity\InertiaDataTables\Http\HandlesInertiaDataTablesExceptions;
 *
 * class Handler extends ExceptionHandler
 * {
 *     use HandlesInertiaDataTablesExceptions;
 * }
 * */
/** @phpstan-ignore trait.unused */
trait HandlesInertiaDataTablesExceptions
{
    /**
     * Register the exception handling callbacks.
     */
    protected function registerInertiaDataTablesExceptions(): void
    {
        $this->renderable(fn (InvalidSortException $e, Request $request): JsonResponse => $this->renderValidationException($request, $e->getMessage(), 400));

        $this->renderable(fn (InvalidFilterException $e, Request $request): JsonResponse => $this->renderValidationException($request, $e->getMessage(), 400));

        $this->renderable(fn (InvalidColumnException $e, Request $request): JsonResponse => $this->renderValidationException($request, $e->getMessage(), 400));
    }

    /**
     * Render a validation exception as JSON response.
     */
    protected function renderValidationException(Request $request, string $message, int $status = 400): JsonResponse
    {
        if ($request->expectsJson() || $request->is('api/*') || $request->hasHeader('X-Inertia')) {
            return response()->json([
                'message' => $message,
                'errors' => [
                    'query' => [$message],
                ],
            ], $status);
        }

        return response()->json([
            'message' => $message,
        ], $status);
    }
}
