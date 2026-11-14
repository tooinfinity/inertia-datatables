<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

abstract class InvalidDataTableException extends InvalidArgumentException
{
    private bool $requestError = false;

    final public function forRequest(): static
    {
        $this->requestError = true;

        return $this;
    }

    public function render(Request $request): JsonResponse|RedirectResponse|false
    {
        if (! $this->shouldHandleAsRequestError()) {
            return false;
        }

        $message = $this->getMessage();

        if (! $request->expectsJson() && $request->hasHeader('X-Inertia')) {
            return back()->withErrors([
                'query' => [$message],
            ]);
        }

        return response()->json([
            'message' => $message,
            'errors' => [
                'query' => [$message],
            ],
        ], 422);
    }

    public function report(): bool
    {
        return $this->shouldHandleAsRequestError();
    }

    private function shouldHandleAsRequestError(): bool
    {
        return $this->requestError && (bool) config('inertia-datatables.handle_exceptions', true);
    }
}
