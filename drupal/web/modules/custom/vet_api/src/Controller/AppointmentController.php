<?php

namespace Drupal\vet_api\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\balto_automation\Service\N8nNotifier;
use Drupal\Core\Database\IntegrityConstraintViolationException;
use Drupal\Core\Database\Connection;
use Drupal\Core\Flood\FloodInterface;
use Drupal\Core\Lock\LockBackendInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/**
 * Manages one shared appointment calendar.
 */
final class AppointmentController extends ControllerBase {

  private const RESERVATION_EVENT = 'vet_api.appointment_reserve';
  private const RESERVATION_LIMIT = 4;
  private const RESERVATION_WINDOW = 900;
  private const SPECIES = ['Perro', 'Gato', 'Otra mascota'];
  private const REASONS = ['Consulta general', 'Vacunación'];

  public function __construct(
    private readonly Connection $connection,
    private readonly FloodInterface $flood,
    private readonly LockBackendInterface $reservationLock,
    private readonly ?N8nNotifier $notifier = NULL,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('database'),
      $container->get('flood'),
      $container->get('lock'),
      $container->has('balto_automation.notifier') ? $container->get('balto_automation.notifier') : NULL,
    );
  }

  private function calendar(): array {
    $now = new \DateTimeImmutable('now', new \DateTimeZone('America/Lima'));
    $start = $now->setTime(9, 0);
    $slots = [];
    $days = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
    for ($day = 0; $day < 7; $day++) {
      $date = $start->modify("+$day days");
      if ($date->format('N') === '7') {
        continue;
      }
      for ($index = 0; $index < 20; $index++) {
        $time = $date->modify('+' . ($index * 30) . ' minutes');
        if ($time <= $now) {
          continue;
        }
        $slots[$time->getTimestamp()] = $days[(int) $time->format('N') - 1] . ' ' . $time->format('d/m H:i');
      }
    }
    return $slots;
  }

  public function slots(Request $request): JsonResponse {
    $booked = $this->connection->select('vet_appointment', 'a')
      ->fields('a', ['start_at'])->condition('start_at', time(), '>=')
      ->execute()->fetchCol();
    $available = array_diff_key($this->calendar(), array_fill_keys($booked, TRUE));
    $day = $request->query->get('day');
    if ($day === 'today' || $day === 'tomorrow') {
      $date = new \DateTimeImmutable($day, new \DateTimeZone('America/Lima'));
      $from = $date->getTimestamp();
      $to = $date->modify('+1 day')->getTimestamp();
      $available = array_filter($available, static fn(int $start): bool => $start >= $from && $start < $to, ARRAY_FILTER_USE_KEY);
    }
    $slots = [];
    foreach (array_slice($available, 0, 5, TRUE) as $start => $label) {
      $slots[] = ['start' => $start, 'label' => $label];
    }
    return $this->response(['slots' => $slots]);
  }

  public function reserve(Request $request): JsonResponse {
    if ($request->getContentTypeFormat() !== 'json' || strlen($request->getContent()) > 1024) {
      return $this->response(['error' => 'Formato inválido.'], 400);
    }
    $data = json_decode($request->getContent(), TRUE);
    $start = $data['start'] ?? NULL;
    $reference = $data['reference'] ?? NULL;
    $species = $data['species'] ?? NULL;
    $reason = $data['reason'] ?? NULL;
    $label = is_int($start) ? ($this->calendar()[$start] ?? NULL) : NULL;
    if (!$label || !is_string($reference) || !preg_match('/^[a-f0-9-]{36}$/D', $reference)
      || !in_array($species, self::SPECIES, TRUE) || !in_array($reason, self::REASONS, TRUE)) {
      return $this->response(['error' => 'Seleccione un turno vigente.'], 400);
    }
    if ($this->matchesReservation($reference, $start, $species, $reason)) {
      return $this->response(['label' => $label, 'reference' => $reference]);
    }

    $identifier = $request->getClientIp() ?? 'unknown';
    $lockName = self::RESERVATION_EVENT . ':' . $identifier;
    if (!$this->reservationLock->acquire($lockName, 5.0)) {
      return $this->response(['error' => 'Hay otra solicitud en curso. Intente en unos segundos.'], 429);
    }
    try {
      if (!$this->flood->isAllowed(self::RESERVATION_EVENT, self::RESERVATION_LIMIT, self::RESERVATION_WINDOW, $identifier)) {
        return $this->response(['error' => 'Se alcanzó el límite de solicitudes de turno. Intente más tarde.'], 429);
      }
      $this->flood->register(self::RESERVATION_EVENT, self::RESERVATION_WINDOW, $identifier);
    }
    finally {
      $this->reservationLock->release($lockName);
    }

    $record = ['start_at' => $start, 'reference' => $reference, 'species' => $species, 'reason' => $reason];
    $created = FALSE;
    try {
      $this->connection->insert('vet_appointment')->fields($record)->execute();
      $created = TRUE;
    }
    catch (IntegrityConstraintViolationException) {
      if (!$this->matchesReservation($reference, $start, $species, $reason)) {
        return $this->response(['error' => 'El turno ya no está disponible.'], 409);
      }
    }
    if ($created) {
      $this->notifier?->appointment($reference, $label, $species, $reason);
    }
    return $this->response(['label' => $label, 'reference' => $reference]);
  }

  private function matchesReservation(string $reference, int $start, string $species, string $reason): bool {
    $existing = $this->connection->select('vet_appointment', 'a')
      ->fields('a')->condition('reference', $reference)->execute()->fetchAssoc();
    return $existing && (int) $existing['start_at'] === $start && $existing['species'] === $species && $existing['reason'] === $reason;
  }

  public function agenda(): array {
    $query = $this->connection->select('vet_appointment', 'a')->fields('a')
      ->condition('start_at', time(), '>=')->orderBy('start_at')->range(0, 200);
    $rows = [];
    foreach ($query->execute() as $reservation) {
      $date = (new \DateTimeImmutable('@' . $reservation->start_at))->setTimezone(new \DateTimeZone('America/Lima'));
      $rows[] = [$date->format('d/m/Y H:i'), $reservation->species, $reservation->reason, $reservation->reference];
    }
    return [
      '#type' => 'table',
      '#header' => ['Turno', 'Mascota', 'Motivo', 'Referencia'],
      '#rows' => $rows,
      '#empty' => 'No hay citas próximas.',
      '#cache' => ['max-age' => 0],
    ];
  }

  private function response(array $data, int $status = 200): JsonResponse {
    return new JsonResponse($data, $status, ['Cache-Control' => 'no-store']);
  }

}
