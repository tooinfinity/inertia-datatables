<?php

declare(strict_types=1);

it('ships only runtime package files in the composer archive', function (): void {
    $repositoryRoot = dirname(__DIR__, 2);
    $gitDirectory = $repositoryRoot.DIRECTORY_SEPARATOR.'.git';

    if (! is_dir($gitDirectory) && ! is_file($gitDirectory)) {
        $this->markTestSkipped('The composer archive test requires a Git checkout.');
    }

    $pipes = [];
    $process = proc_open(
        ['git', 'archive', '--format=tar', '--worktree-attributes', 'HEAD'],
        [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ],
        $pipes,
        $repositoryRoot,
    );

    if (! is_resource($process)) {
        throw new RuntimeException('Unable to start git archive.');
    }

    fclose($pipes[0]);
    $archive = stream_get_contents($pipes[1]);
    $errorOutput = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);

    $exitCode = proc_close($process);

    expect($exitCode)->toBe(0, $errorOutput ?: 'git archive failed.');

    if (! is_string($archive)) {
        throw new RuntimeException('Unable to read the git archive.');
    }

    $archivePath = sys_get_temp_dir().DIRECTORY_SEPARATOR.'inertia-datatables-'.bin2hex(random_bytes(8)).'.tar';
    file_put_contents($archivePath, $archive);

    try {
        $phar = new PharData($archivePath);
        $prefix = 'phar://'.str_replace('\\', '/', $archivePath).'/';
        $topLevelEntries = [];

        foreach (new RecursiveIteratorIterator($phar) as $file) {
            $path = $file->getPathname();

            if (! str_starts_with($path, $prefix)) {
                throw new RuntimeException("Unexpected archive path: {$path}");
            }

            $relativePath = substr($path, strlen($prefix));
            $topLevelEntries[] = explode('/', $relativePath)[0];
        }

        $topLevelEntries = array_values(array_unique($topLevelEntries));
        sort($topLevelEntries);
    } finally {
        unset($phar);
        unlink($archivePath);
    }

    expect($topLevelEntries)->toBe([
        'CHANGELOG.md',
        'LICENSE.md',
        'README.md',
        'composer.json',
        'config',
        'src',
    ]);
});
