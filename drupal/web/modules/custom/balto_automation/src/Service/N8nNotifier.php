<?php

declare(strict_types=1);

namespace Drupal\balto_automation\Service;

use Drupal\commerce_order\Entity\OrderInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use GuzzleHttp\ClientInterface;

/** Envía eventos de pedidos a n8n. Un fallo nunca interrumpe la compra ni el pago. */
final class N8nNotifier {
  public function __construct(
    private readonly ClientInterface $http,
    private readonly LoggerChannelFactoryInterface $loggerFactory,
  ) {}

  public function appointment(string $reference, string $slot, string $species, string $reason): void {
    try {
      $this->dispatch([
        'event' => 'appointment_reserved',
        'reference' => $reference,
        'slot' => $slot,
        'species' => $species,
        'reason' => $reason,
      ]);
    }
    catch (\Throwable $error) {
      $this->loggerFactory->get('balto_automation')->warning('No se pudo enviar el aviso de una cita a n8n: @type', [
        '@type' => get_class($error),
      ]);
    }
  }

  /** @param string $event 'placed' (pedido realizado) o 'paid' (pago confirmado). */
  public function order(OrderInterface $order, string $event): void {
    if (!getenv('BALTO_N8N_SECRET')) {
      return;
    }
    try {
      $items = [];
      foreach ($order->getItems() as $item) {
        $items[] = ['title' => $item->label(), 'quantity' => (string) (int) $item->getQuantity(), 'total' => $item->getTotalPrice()->getNumber()];
      }
      $total = $order->getTotalPrice();
      $this->dispatch([
        'event' => $event,
        'order_id' => (int) $order->id(),
        'order_number' => (string) ($order->getOrderNumber() ?: $order->id()),
        'email' => (string) $order->getEmail(),
        'total' => $total ? $total->getNumber() : '0',
        'currency' => $total ? $total->getCurrencyCode() : 'PEN',
        'payment_gateway' => $order->get('payment_gateway')->target_id,
        'payment_method' => $order->get('payment_gateway')->entity?->label() ?? '',
        'items' => $items,
      ]);
    }
    catch (\Throwable $e) {
      // No se registra el cuerpo ni el secreto, solo el tipo de error.
      $this->loggerFactory->get('balto_automation')->warning('No se pudo avisar a n8n (@e) del pedido @n: @m', ['@e' => $event, '@n' => $order->id(), '@m' => get_class($e)]);
    }
  }

  private function dispatch(array $payload): void {
    $secret = (string) getenv('BALTO_N8N_SECRET');
    if ($secret === '') {
      return;
    }
    $url = (string) (getenv('BALTO_N8N_ORDER_URL') ?: 'http://n8n:5678/webhook/balto-pedido');
    $this->http->request('POST', $url, [
      'json' => $payload,
      'headers' => ['X-Balto-Secret' => $secret],
      'timeout' => 3,
      'connect_timeout' => 2,
    ]);
  }

}
